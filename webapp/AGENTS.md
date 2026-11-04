# AGENTS.md

## Role and Purpose

You are an autonomous AI coding assistant integrated into this repository. Your primary goal is to maintain code quality, implement requested features, fix bugs, and adhere strictly to the project guidelines defined in this workspace.

### Core Rules

1. Never modify configuration files or dependencies without explicit user request.
2. Always write clean, well-documented code matching the existing style of the repository.
3. Validate all changes against existing tests before confirming completion.
4. If a requirement is ambiguous, ask clarifying questions instead of guessing.

### Workflow Instructions

1. Analyze the given task or issue description thoroughly.
2. Locate the relevant files using standard file search tools.
3. Plan your implementation steps and state them briefly before writing code.
4. Implement the solution incrementally.
5. Provide a clear summary of changes made and instructions for verification.
6. Do not read the Readme.md.

## Project

The `webapp` branch contains an Angular web app that recreates the CANopen editor from `main`
in the browser. It reads and writes XDD format exclusively.

The application lives under `webapp/` and covers device information, the object dictionary,
and PDOs. Multiple devices can be open at the same time. XDD 1.0 files can be opened; saving
produces a normalized XDD 1.1 file. Additional XML fragments outside of identity,
file information, object dictionary, baud rates, and network features are not preserved.

The web UI should replicate the CANopenEditor EDSEditorGUI with the older WinForms interface.
All labels within the UI remain in their original English language and are not translated.

### Layout

The following images show the prescribed layout for each tab.

#### Tab "Device Info" 

![Tab Device Info](images/Template_Tab_Device_Info.png)

#### Tab "Object Dictionary"

![Tab Object Dictionary](images/Template_Tab_Object_Dictionary.png)

The three stacked lists "Communication Specific Parameters", "Manufacturer Specific Parameters",
and "Device Profile Specific Parameters" should each be independently collapsible.

Highlight the beginning of each list.

#### Tab "TX PDO Mapping"

![Tab TX PDO Mapping](images/Template_Tab_TX_PDO_Mapping.png)

#### Tab "RX PDO Mapping"

![Tab RX PDO Mapping](images/Template_Tab_RX_PDO_Mapping.png)

### Profiles

Provide a button for loading one or more profiles. The `EDSEditorGUI/Profiles` folder contains
files with predefined profiles for use with CANopenEditor. Offer these profiles when loading.

Provide two buttons to check all objects and to uncheck all objects. Checked objects are included in the project profile.

If an object already exists in the project file, leave it unchecked in the list. If the user checks that object again,
highlight it in the list. When the selection is saved, ask whether to overwrite the existing object.

### PDO Mapping

The "TX PDO Mapping" tab comes before the "RX PDO Mapping" tab. The following applies to both tabs.

#### Graphical PDO overview

- Each object in a PDO row starts and ends exactly on bit boundaries. The bit and byte header
  cells use the same 64-bit grid as the mapped objects. Odd byte header cells use a different
  background color.
- Selecting a PDO highlights it with a frame drawn around the whole row. Selecting a PDO that was
  not selected before clears an existing object selection in the other PDOs.
- The free bits after the mapped objects are shown as a single "Empty" element without a gray box.
- Right-clicking a mapped object opens a context menu with "Insert Item before", "Insert Item after",
  and "Remove Item". As in the desktop editor, inserting adds a "Dummy Int8" (0x0002) placeholder that
  is selected afterwards. If the free space is not sufficient, the usual warning is shown.
- The COB and Index columns are shown in hexadecimal (e.g. `0xC0000180`, `0x1800`). The COB value
  matches the "COB" field in "Communication parameters" without an optional `$NODEID+` prefix.

#### Available Objects for PDO

- Objects for a PDO are chosen from the "Available Objects for PDO" list. Select an element in
  the PDO, then select the corresponding object in the list. Selecting a PDO element that is
  already assigned automatically selects the matching object in the list and scrolls it to
  roughly the middle of the visible list.
- If no element is selected in the PDO, no object can be selected in the list.
- The list always starts with the following dummy objects, which can always be selected:

| Name         | Object index | Sub-index |
|--------------|--------------|-----------|
| Dummy Int8   | 0x0002       | 0x00      |
| Dummy Int16  | 0x0003       | 0x00      |
| Dummy Int32  | 0x0004       | 0x00      |
| Dummy UInt8  | 0x0005       | 0x00      |
| Dummy UInt16 | 0x0006       | 0x00      |
| Dummy UInt32 | 0x0007       | 0x00      |

#### Communication parameters

- The "Communication" and "Mapping" indices are editable. As in the desktop editor, the mapping
  index is always the communication index plus 0x200, so changing either index moves both objects.
- The "Invalid" checkbox is placed below the "COB" line.
- A "Bitwise mapping" checkbox is placed below the "Sync start" line.
  - If "Bitwise mapping" is not checked, every object occupies the width of its datatype rounded
    up to a multiple of 8 bits (at least 8 bits, at most 64 bits). BOOLEAN occupies 8 bits.
  - If "Bitwise mapping" is checked, the selected object in "Available Objects for PDO" shows a
    "-" and a "+" button next to its number of bits to adjust the number of bits used. The
    buttons are placed in an extra column that is reserved as long as the checkbox is checked,
    so the column widths stay constant when switching between objects. The default value is the
    width of its datatype. The width of the selected object in the graphical PDO overview is
    updated immediately. BOOLEAN objects occupy at most one bit, so they show no "-" and "+" buttons.
    When the checkbox is checked, mapped objects wider than their datatype shrink to that width.
- "Event Timer" is editable in both tabs, including "RX PDO Mapping".

#### Object Dictionary

In the "Object Dictionary" tab, the sub-objects of the PDO mapping objects "TPDO mapping parameter"
and "RPDO mapping parameter" display the mapped object in the format
`object-index/sub-index/name (bit width)`. Changes in the PDO tab update these labels immediately;
there is no refresh button. When the project is saved, the labels replace names such as
"Application object 1" in the project file.
