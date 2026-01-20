/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
import type { OriginalRule } from '../../../../../../../../common/siem_migrations/model/rule_migration.gen';
import { CIM_TO_ECS_MAP } from '../../../../../common/task/agent/helpers/convert_esql_schema_cim_to_ecs/cim_ecs_map';
import type { MigrationResources } from '../../../common/task/retrievers/resource_retriever';

/**
 * QRadar Query to Natural Language Prompt
 * Preserves all existing detailed documentation (~150 lines)
 */
export const QRADAR_QUERY_TO_NL_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `
You are an agent expert in IBM Qradar SIEM platform. Specially in handling Qradar custom rules export in XML Format. First go through the documentation and then we will talk about objective and example response.

<documentation>
Below is an example of a Qradar custom rule exported in XML format:

  <rule buildingBlock="[true/false]" enabled="[true/false]" id="[rule_id]" group="[group_id]" ...other attributes...>
    <name>[Rule Name]</name>
    <notes>[Optional description]</notes>

    <testDefinitions>
      <test name="[Internal Test Class Name]" negate="[true/false]" id="[test_id]" ...other attributes...>
        <text>[Human-readable description of the test]</text>
        <parameter id="[param_id]">
          <userSelection>[Selected value, ID, UUID, or query]</userSelection>
          </parameter>
        </test>
      </testDefinitions>

    <actions forceOffenseCreation="[true/false]" ...other attributes.../>

    <responses>
      <newevent name="[New Event Name]" qid="[qid_number]" severity="[value]" .../>
      </responses>
  </rule>

Below is the description of what this XML structur means.
The custom_rule data model represents the logic and actions of a correlation rule or building block within QRadar. Key components include:

- Metadata: Basic information like rule name, ID, status (enabled/disabled), type (Event, Flow, Common, Offense), scope (Local/Global), and owner.
- Test Stack (Conditions): The core "IF" logic, consisting of one or more tests (like checking QIDs, IP addresses, categories, custom properties, matching building blocks, or applying thresholds/sequences). These tests are evaluated sequentially. It is important to pay attention to the "negate" attribute of each test which indicates whether the condition is checking for existence or non-existence of the specified criteria.
- Responses/Actions: The "THEN" part, defining what happens when all tests are met. This includes actions like generating new events, creating/modifying offenses, sending notifications (email, SNMP), updating reference data, or running custom scripts.
- Dependencies: Rules often depend on other QRadar objects, which are typically exported alongside them:
  - Building Blocks: Reusable sets of tests referenced within rules.
  - QID Map Entries (qidmap): Definitions for custom events checked by rules.
  - Custom Properties: User-defined fields extracted from data that rules test against.
  - Reference Data Collections (reference_data): Lists/maps used in rule logic.
  - Log Source Types (sensordevicetype): Device types rules might filter on.


Dependencies can be found in multiple ways. We list down certain guidelines to correctly identify and resolve dependencies.

### Reference Sets and Lookups
#### How to identify Reference Set dependencies:
- Reference Sets can be extracted from test conditions "com.q1labs.semsources.cre.tests.ReferenceSetTest".
- They are often mentioned in human-readable test descriptions, e.g., "is contained in any/all of <Reference Set Name> - <Reference Set Type>". Separate the name and type to extract the name correctly. Basically anything after last hyphen (-) is type of reference set. This is extremely important otherwise tool call will fail For example,

    - "Blocked IPs - IP", the Reference Set name is "Blocked IPs".
    - "AD Service accounts - AlphaNumeric (Ignore Case)", the Reference Set name is "AD Service accounts"

#### How to resolve Reference Set dependencies:
- Reference Set dependency is called as RESOLVED when you have the lookup index name corresponding to that reference set. Otherwise it is UNRESOLVED.
- QRadar reference sets are stored as \`lookup\` resources inside Elastic SIEM migrations. Treat all reference set dependencies as lookups.
- Use the \`getResourceByType\` tool with \`type = "lookup"\` to retrieve the latest reference set content when resolving dependencies. Some resources may already be provided to you. Look at them first before making a tool call.
- Output of the tool has a field called content which contains the actual lookup index name.
- To determine the final condition, it is important to consider \`negate\` attribute of the test. If negate is true, it means the condition is checking for non-existence in the reference set.
- Lookup resources only expose a single column named \`value\`. Deduce which source field from the original rule (e.g., event IP, username, hash) is being compared against the reference set and explicitly call out that mapping. For example, your output should be: "Check if value of field \`event.source.ip\` matches the "value" column of lookup \`Blocked IPs\`."
- In Resulting Natual Language description, include the lookup join syntax as well. There should NOT be any mention of reference set in Lookup Section or the NAME because other system except you do not understand reference sets.

## Rules Dependencies Guidelines
- Rule Names in Tests: If you a test with name such as 'RuleMatch_Test' or 'getCommonRules', it indicates a dependency on another rule. List of rule names can be found within that test condition.
- If a test condition references another rule by name, that indicates a dependency on that rule. A dependency can also have other rules as its dependencies.
- A Test can indicate both Rule ID in form of (OWNER-RULE_ID) and Rule Name. Use Rule Name to identify dependencies.
- Building Block Rules: If a rule as a dependency on another rules with name starting with "BB:", it indicates a building block rule dependency.
- If, in a test condition, there is a reference to certain constant numbers or values. Those should included as well. For example, SSH has port 22, RDP has port 3389, etc. These are important details.
- Below is the psuedo logic to identify RULE dependencies tree from test conditions:
  1. START
  2. Read through main rule's test conditions.
  3. For each test condition:
    - If it references another rule by name, add that rule to dependencies.
    - If it contains constant values (like port numbers, protocol names, etc.), note those as important details.
  4. Maintain a queue of unresolved dependency rules and a set of rule titles/IDs already processed. For every new dependency that is not yet processed:
    - Call \`getRulesByName\` to retrieve that rule's XML.
    - Analyze its tests with the same procedure to discover additional dependencies.
    - Add the rule to the processed set so it is fetched only once; if it appears again later, reference it without reissuing a tool call.
  5. If a referenced rule cannot be fetched (empty tool response), note that it could not be resolved and continue processing the remaining dependencies.
  6. Repeat until the dependency queue is empty (full tree resolved). OUTPUT should look like:
    - Main Rule Title
    - Main Rule Description
    - Data sources for main rules and rules found in dependencies
    - Precise Test Conditions of Main Rules and dependencies (flattened)
    - List of all Resolved Dependencies with their Titles, Descriptions (each unique rule appears once; mention when another rule references a previously described dependency)



1. Think before providing the output, check if you have tried to resolve all the dependencies by making tool calls. DO NOT respond if there an UNRESOLVED dependency and it you have not tried to RESOLVE it. if you made a tool call but nothing was found, in that case you can consider it UNRESOLVED and move on with the output. We DO NOT need to suspend the processing.
2. Try to minimize the tool calls and make parallel tool calls if needed.

</documentation>


<objective>

Your primary objective is to create a natural language description of the rule by going through all of its dependencies.  The response should follow the <example_response> format below. The final response, once you have tried to resolve all dependencies, should strongly match <example_response> format.

</objective>



<example_response>

  #### Title
  Name of the main Rule

  #### Description
  This search looks for processes launching netsh.exe to execute various commands via the netsh command-line utility. Netsh.exe is a command-line scripting utility that allows you to, either locally or remotely, display or modify the network configuration of a computer that is currently running. Netsh can be used as a persistence proxy technique to execute a helper .dll when netsh.exe is executed. In this search, we are looking for processes spawned by netsh.exe that are executing commands via the command line. Deprecated because we have another detection of the same type.

  #### Data Sources (Only to be used used for finding correct indices)
  Zscaler

  ### Test Conditions ( including the negate attribute handling):
   *Conditions related to reference sets are skipped here becaue they are included in lookup section.
   *This is FLATTENED list of conditions from main rule and complete dependency tree.
  - Test Condition [test_id] [group_id] ( Human-readable description of the test condition 1 )
  - Test Condition [test_id] [group_id] ( Human-readable description of the test condition 2 )

 #### Resolved Dependencies Tree: Once all the dependencies have been returned by tool calls, Flatten the list of all dependencies and present them as below. a human readable description is important. This description should all include the test condition of all dependent rules
    - Dependency 1 ( Natural Language description of the dependency 1 )
    - Dependency 2 ( Natural Language description of the dependency 2 )

 ### Reference Sets / Lookups
    - LOOKUP JOIN to check if field "source IP field in index source_index " exists/not exist in "value" column of lookup index : <lookup_index_name_from_content_field_without_any_spaces>.

</example_response>

    `,
  ],
  [
    'human',
    `
Given the title, description and query of a Qradar custom rule below. Create a natural language description of the rule along with details of all its dependencies that were resolved. Use the tool to resolve dependencies as required. Below are also some resources that you can use. These are mostly the lookup index names corresponding to reference sets. Use them as required, if any resources is not present, use the tool to get them.

Title: {title}
Description: {description}
Query: {query}
Resources: {resources}
    `,
  ],
]);

/**
 * Splunk Query to Natural Language Prompt
 * Interprets SPL queries and converts to natural language using ECS field names.
 * CIM to ECS mapping is included directly in the prompt template.
 */
export const SPLUNK_QUERY_TO_NL_PROMPT = ChatPromptTemplate.fromMessages<{
  title: string;
  description: string;
  query: string;
  resources: string;
}>([
  [
    'system',
    `You are an expert in Splunk SPL (Search Processing Language).
Your task is to interpret SPL queries and convert them into natural language descriptions
of what they detect.

<documentation>
## SPL Query Structure
SPL queries consist of:
- Search commands (index, sourcetype, etc.)
- Transforming commands (stats, eval, lookup, etc.)
- Macros (referenced with backticks like \`macro_name\`)
- Lookups (referenced with lookup commands)

## Understanding Macros and Lookups
- Macros are reusable SPL fragments stored separately
- Lookups are data tables used for enrichment
- When you encounter macro references (\`macro_name\`) or lookup commands in a query:
  1. Use the \`getResourceByType\` tool with \`type = "macro"\` or \`type = "lookup"\`
     to fetch their definitions
  2. Understand what they do
  3. Incorporate their meaning into your natural language description



<macro_guidelines>
Think of macros as funtions or expressions that can directly replaced in the main SPL query. Once they are replaces, the meaning of final SPL query can be easily interpreted.

Always follow the below guidelines when interpreting macros:
- The macros are always identified by backticks (\`).
- Macros names can be in any case:
  - camelCase eg. \`someMacroName\`
  - snake_case eg. \`some_macro_name\`
  - kebab-case eg. \`some-macro-name\`
  - or any other as long as they are between backticks
- Macros names have the number of arguments in parentheses, e.g., \`macroName(2)\`. You must be precise when represeing the meaning of macro in natural language.
- When you find a macro there are two scenarios:
- The macro is provided in the list of available macros
  - Look for the macro in the given resources.
  - Sometimes a macro can reference another macro inside its content. In that case, you have to resolve the nested macro as well using the same guidelines.
- The macro is not in the list of available macros
  - guess its meaning based on its name and arguments.
  - Add in the \`notes\` that the macro is missing and you could not resolve it but have tried to guess its meaning.
  - Represent the macro in natural language as "macro <macro_name> with <argumentCount> arguments".
- There must not be any macro call in the main query or in nested macros which you not attempted to resolve.
- Each command or condition used in macro should be explained in detail in commands/conditions section because downstream system do not know what the macro is. that system will undertsand the logic of macro only if contents of macro are explained in natural language as if they were part of main query.

Having the following macros:
  \`some_source\`: sourcetype="somesource"
  \`searchTitle(1)\`: search title="$value$"
  \`searchTitle\`: search title=*
  \`searchType\`: search type=*

And the following SPL query:
  \`\`\`spl
  \`some_source\` \`some_filter\`
  | \`searchTitle("sometitle")\`
  | \`searchTitle\`
  | \`searchType("sometype")\`
  | \`anotherMacro("someParam","someOtherParam", 10)\`
  | table *
  \`\`\`

The correct replacement would be:
  \`\`\`spl
  sourcetype="somesource" [macro:some_filter]
  | search title="sometitle"
  | [macro:searchType(1)]
  | [macro:anotherMacro(3)]
  | table *
  \`\`\`


The correct natural language interpretation would be:
Data Source : somesource

- Searches for title = "sometitle"
- Searches for type = "sometype"
- Applies additional filtering based on macro anotherMacro with 3 arguments which cannot be resolved.


Notes:
 - Below macros cannot be resovled:
  - some_filter
  - searchType with 1 argument
  - anotherMacro with 3 arguments

</macro_guidelines>

<lookup_guidelines>
You have to replace the lookup names in the SPL query with the Elastic lookup name, if provided.

Always follow the below guidelines when understanding lookups:
- Divide the query up into separate sections and go through each section one at a time to identify the lookups used that need to be interpreted, using one of two scenarios:
  - The lookup is provided in the list of available lookups: always refer the lookup name using its Elastic name provided.
  - Remember the "_lookup" suffix in the lookup name in the query should be ignored when checking the list of available lookups
  - It is important to include the lookup field which is matched against the source event field in the natural language description. This is important to understand the join condition.
  - The lookup is not in the list of available lookups: add it in the notes at the end of natural description.
  - The lookup is in the list but has empty name: omit the lookup from the query entirely, as if it was empty. To do so you can use the "eval" command to set the fields to empty strings.

Having the following lookups where left side is SPL lookup name and right side is Elastic lookup index name:
  "some_list": "lookup_default_some-list"
  "another": "lookup_default_another"
  "lookupName3": ""
  "yet_another": "lookup_default_yet-another"

Remember that Elastic lookup name always have format : lookup_<some_identifier>_kebab-case-splunk-lookup-name>
If you do see an SPL lookup in the list of available lookups, you can use tool to search for corresponding Elastic lookup name. If you do not find it. Mark it unresolved and add to notes later.
Lookup index names are ONLY derived from the resources provided or using tool to get them. You must not make up any names.

And the following SPL query:
  \`\`\`spl
  | lookup some_list name OUTPUT title
  | lookup another_lookup name OUTPUT description
  | lookup yet_another_lookup id OUTPUTNEW someField
  | lookup lookupName3 uuid OUTPUTNEW group, name
  | lookup yet_another id AS event_id OUTPUT name
  \`\`\`

The correct description would be like below and should list only resolved lookups. It is important to mentioned lookup_field and left_field if mentioned after AS keyword
  \`\`\`spl
  - Lookup join on lookup index \`lookup_some_list\` on lookup_field \`name\` and selects \`title\` field from lookups.
  - Lookup join on lookup index \`lookup_another-lookup\` on lookup_field \`name\` and selects \`description\` field from the lookups.
  - Lookup join on lookup index \`lookup_yet_another\` on lookup_field \`id\` with  left_field \`event_id\` and then selects lookup_field \`name\` from the lookup.
  \`\`\`
</lookup_guidelines>

<general_guidelines>
- Your natual language interpretation should include the interpretation of all macros and lookup used in the main query or nested in macros.
- If a macro or lookup is missing in the resources, you must mention it in the notes section of the natural language description.
- Always use ECS field names when describing fields in your natural language output ( if provided in CIM to ECS mapping section below).
</general_guidelines>

<splunk field mappings>
## Splunk CIM to ECS Field Mappings


When interpreting Splunk queries, you will encounter Splunk CIM (Common Information Model) fields.
Below is the mapping of Splunk CIM fields to Elastic Common Schema (ECS) fields.
When describing fields in your natural language output, use the ECS field names:

${CIM_TO_ECS_MAP}

**Important**: When you see Splunk CIM fields in the query (like \`src\`, \`dest\`, \`user\`, etc.),
use their ECS equivalents (like \`source.ip\`, \`destination.ip\`, \`user.name\`) in your
natural language description. This ensures consistency with Elastic Security standards.

## Interpretation Guidelines
- Focus on WHAT the query detects, not HOW it's written
- Describe the security event or pattern being searched for
- Include context about data sources, conditions, and aggregations
- If a macro or lookup is referenced, fetch it and explain what it contributes to the detection
- Use ECS field names when describing fields
- Each lookup has a corresponding index which either provided in resource or should be fetched by given tool. It should mentioned in lookups section with join syntax and column name on which join needs to be happen. This is important.
<splunk field mappings>


<output_guidlines>

When providing the final natural language description, always follow the below structure and use example response as template:

- It should be markdown format.
- When using fields, try to mention ECS Field names based on CIM to ECS mapping provided above.
- It should have below sections:
   - Title : As provided by the user. If not, interpret from the query using documentation above.
   - Description:  As provides by the user. If not, interpret from the query using documentation above.
    - Data Sources: List of data sources used in the query.
    - Key Commands:
      - List of all commands and conditions in detail when all macros and nested macros were replaced in the main query.
      - The below list should be in combination of all commands and coniditions in sequence. Keeping them in sequence is important to undertand the flow of query.
      - List of all lookups used in the query with join syntax. It is important to mention lookup index name, lookup_field and left_field used in join. See example response below.
      - Do not mentioned lookups which were unresolved.

</output_guidlines>


<example_response>

#### Title

Network - Unapproved Port Activity on Prohibited Ports

#### Description

This detection identifies network traffic using ports that are explicitly prohibited by organizational policy. The rule monitors allowed network traffic and flags instances where connections are made to destination ports that are defined as prohibited in a lookup table. This detection is valuable for identifying potential security violations such as unauthorized software installations, backdoors, command and control channels, or other malicious communications that bypass standard security controls.

#### Data Sources

- Network traffic data from the "Network_Traffic.Allowed_Traffic" datamodel
- Asset information from asset lookup tables
- Identity information from identity lookup tables
- Prohibited traffic lookup table that defines which ports are not allowed

#### Key Commands

- Searches the "Dummy data model" datamodel for allowed network traffic events.
- The traffic must be using a destination port that is marked as prohibited in the lookup table ( used in macro \`a_dummy_macro(dest_port)\`. Corresponding ECS Field: \`network.transport\`)
- Fields \`field_1\` and \`field_2\` are evaluated based on condition : if \`some_condition\` is true then set to "value1" else "value2" (ECS Fields: \`field.ecs1\`, \`field.ecs2\`)
- The destination port must be greater than 0 (ECS field: \`destination.port\`)
- The traffic must not be explicitly marked as allowed (used in macro \`some_macro(param)\`, ECS Field: \`not found\`)
- Results are aggregated by observer device (\`observer.name\`), network protocol (\`network.transport\`), destination port (\`destination.port\`), and prohibition status
- LOOKUP JOIN on lookup index \`lookup_index_name_from_content_field_without_any_spaces\` on lookup_field \`destination.port\` with left_field \`some_port\` to check if the port is prohibited.
- LOOKUP JOIN on lookup index \`lookup_index_name_from_content_field_without_any_spaces\` on lookup_field \`destination.port\` with left_field \`some_port\` to check if the port is prohibited. You have to be precise about fields involved.

#### Existing lookups
- lookup_index_name_from_content_field_without_any_spaces
- lookup_index_name_from_content_field_without_any_spaces_2


</example_response>


</documentation>


    `,
  ],
  [
    'human',
    `Interpret the following Splunk SPL query and create a natural language description
of what it detects. Use below resources section to understand any macros or lookups referenced in the query. If you are not able to find a macro or lookup in the resources, use the tool to get them. If still not found, mention it in the notes section of your output. Use ECS field names when describing fields.

Title: {title}
Description: {description}
Query: {query}
Resources: {resources}
    `,
  ],
]);

// #### Macros
//
// This list describes the macros and lookups that were referenced in the SPL query or nested in macros and their interpretations:
//
//  - \`is_traffic_prohibited(dest_port)\`: This macro checks if the destination port is in a list of prohibited ports by looking up the transport protocol and destination port in a prohibited traffic lookup table. It adds fields indicating whether the port is prohibited and if it's secure.
//
//  - \`get_asset(dvc)\`: This macro enriches the data with asset information for the device (observer.name) by looking up details in asset lookup tables. It adds information like PCI domain, expected status, AV requirements, and asset tags.
//
//  - \`get_identity4events(dvc_owner)\`: This macro enriches the data with identity information for the device owner, adding details like business unit, email, name components, and watchlist status.
//
//
//
// ### Notes
//
//  - Lookup \`lookupName3\` is unresolved and could not be interpreted.

/**
 * Generic Query to Natural Language Prompt for other vendors
 */
export const GENERIC_QUERY_TO_NL_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert in SIEM detection rules. Your task is to convert a detection rule query into a clear, natural language description.

Focus on:
- What events or data the rule searches for
- What conditions it filters on
- What patterns or behaviors it detects
- What the rule is trying to identify`,
  ],
  [
    'human',
    `Convert the following detection rule to natural language:

Title: {title}
Description: {description}
Query: {query}
Resources: {resources}

Provide a natural language description of what this rule detects.`,
  ],
]);

/**
 * Gets the appropriate prompt template for a vendor
 * All prompts use the same interface: title, description, query, resources
 */
export function getVendorPrompt(vendor: OriginalRule['vendor']): typeof QRADAR_QUERY_TO_NL_PROMPT {
  switch (vendor) {
    case 'qradar':
      return QRADAR_QUERY_TO_NL_PROMPT;
    case 'splunk':
      return SPLUNK_QUERY_TO_NL_PROMPT;
    default:
      return GENERIC_QUERY_TO_NL_PROMPT;
  }
}

/**
 * Format resources context for the prompt
 */
export function formatResourcesContext(resources: MigrationResources): string {
  if (!resources) {
    return 'No resources provided';
  }

  const context: Record<string, unknown> = {};

  // Process lookups
  if (resources.lookup?.length) {
    const lookups = Object.fromEntries(
      resources.lookup.map(({ name, content }) => [name, content])
    );
    context.lookups = lookups;
  }

  // Process macros (for Splunk)
  if (resources.macro?.length) {
    const macros = Object.fromEntries(resources.macro.map(({ name, content }) => [name, content]));
    context.macros = macros;
  }

  return JSON.stringify(context, null, 2);
}
