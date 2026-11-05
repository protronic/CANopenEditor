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
7. Do not commit or push changes before the user has tested them in the browser. After implementing
   and checking a change (tests, build), keep the dev server (`ng serve --host 0.0.0.0 --port 4200`)
   running, leave the changes uncommitted, and ask the user to test them. Commit, push, and update
   the pull request only after the user confirms.

## Project

The `webapp` branch contains an Angular web app that recreates the CANopen editor from `main`
in the browser. It reads and writes XDD format exclusively.

The application lives under `webapp/` and covers device information, the object dictionary,
and PDOs. Multiple devices can be open at the same time. XDD 1.0 files can be opened; saving
produces a normalized XDD 1.1 file. Additional XML fragments outside of identity,
file information, object dictionary, baud rates, and network features are not preserved.

The web UI should replicate the CANopenEditor EDSEditorGUI with the older WinForms interface.
All labels within the UI remain in their original English language and are not translated.

The start page offers the buttons "New", "Open", and "Open example XDD". The header does not show a
notice that a file was opened.

Questions to the user use an in-app overlay window with "OK" and "Cancel" instead of `confirm()`.
Errors and warnings use an in-app overlay window that must be acknowledged with "OK".

### Layout

The following images show the prescribed layout for each tab.

#### Tab "Device Info" 

![Tab Device Info](images/Template_Tab_Device_Info.png)

#### Tab "Object Dictionary"

![Tab Object Dictionary](images/Template_Tab_Object_Dictionary.png)

The three stacked lists "Communication Specific Parameters", "Manufacturer Specific Parameters",
and "Device Profile Specific Parameters" should each be independently collapsible.

Highlight the beginning of each list.

Several objects can be selected in a list with Ctrl+click and Shift+click. Right-clicking an object
opens a context menu with "Add...", "Clone...", "Delete...", and "Toggle". "Clone..." opens the
"Insert OD Objects" dialog for the selected objects:

- "Target" selects one of the open projects.
- "Index Offset" takes a positive or negative offset (decimal or `0x` hex); a space separated list
  creates several clones. Each offset gets its own column with the new indices.
- An object whose clone would overwrite an existing object (or whose new index is invalid) is still
  listed, but without a checkbox, and its conflicting index is highlighted. It is not cloned.
- A trailing number in the object name is shifted by the offset, as in the desktop editor.

"Add..." proposes the index from the mouse position when the menu was opened: the next free index
after the object under the mouse pointer, within the parameter range of its list (communication
0x1000–0x1FFF, manufacturer 0x2000–0x5FFF, device profile 0x6000–0xFFFF). Right-clicking the empty
area of a list uses the next free index after its last object, or the first index of the range if
the list has no objects.

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

#### Saving PDO changes

Changes to a PDO in "TX PDO Mapping" and "RX PDO Mapping" must be saved explicitly, as in the
"Object Dictionary" tab. This covers the communication parameters, the indices, "Bitwise mapping",
and the mapped objects (assigning, bit width, "Insert Item before/after", "Remove Item"). Unsaved
changes are kept in a draft of the PDO; the communication object and the PDO mapping object in the
object dictionary are updated only when the PDO is saved. While the selected PDO has unsaved
changes, the "Save" button is highlighted. Selecting another PDO, or "Add new PDO", then shows the
question "Unsaved changes": "Yes" discards the changes (including a moved index), "No" saves them,
"Cancel" stays on the PDO. With "Autosave changes" checked, changes are saved without the question.
"Delete PDO" deletes the PDO after its own confirmation.

#### Unsaved changes in both tabs

Changes in the "Object Dictionary" tab are written to the object only with "Save Changes" (or by
"Autosave changes"); until then the PDO tabs show the saved state. In the other direction, the
"Object Dictionary" tab shows the saved state of a PDO until it is saved in its PDO tab.

- Saving a PDO while the "Object Dictionary" tab has unsaved changes on its communication or mapping
  object shows a warning that asks whether these changes shall be overwritten. "OK" discards them and
  saves the PDO, "Cancel" keeps both and does not save.
- Saving an object in the "Object Dictionary" tab while a PDO tab has unsaved changes on that object
  shows the same warning. "OK" discards the PDO changes and saves the object, "Cancel" does not save.

Before a sub-object of a PDO mapping object is saved in the "Object Dictionary" tab, the mapping is
checked for consistency; on an error a warning is shown and nothing is saved:

- the number of mapped objects (sub-index 0x00) is between 0 and 64, and all counted entries exist;
- every used entry is a valid mapping value and refers to an existing object or dummy object;
- the bit width of an entry does not exceed the width of the datatype of the mapped object;
- all used entries together fit into the 64 bits of the PDO;
- without "Bitwise mapping", all bit widths are whole bytes.

#### Object Dictionary

In the "Object Dictionary" tab, the sub-objects of the PDO mapping objects "TPDO mapping parameter"
and "RPDO mapping parameter" are named after the mapped object in the format
`mapping-index - object-index/sub-index/name`, e.g. `2 - 0x0005/00/Dummy UInt8`. The mapping index is
the sub-index within "TPDO mapping parameter" or "RPDO mapping parameter", written as a decimal
number; it keeps the name unique when a PDO contains objects with the same name. The bit width is
not part of the name.

The name is written only when the mapped object of the entry changes: by assigning another object
in the PDO tab, by "Insert Item before"/"Insert Item after", or by changing the default value of the
entry in the "Object Dictionary" tab to another object. Changing only the bit width keeps the name.
The name can be edited afterwards; an edited name is kept, also when saving, until the mapped object
of the entry changes. When entries move because an item is inserted or removed, generated names
follow the new mapping index, edited names move unchanged with their entry. Names of existing
projects, e.g. "Application object 1", stay unchanged until the mapped object changes.

In the "Object Dictionary" tab, the button "Reset Name" appears right of the "Name" input field
when a PDO mapping object (0x1600–0x17FF or 0x1A00–0x1BFF) is selected; the input field is shortened
so that the button is right-aligned with the fields below. The button is enabled only for active
entries: sub-index 0x01 and higher, counted by sub-index 0x00, mapping an object, and in a mapping
object that is enabled. For deactivated entries it is disabled. It puts the generated name of the selected entry into the "Name" field,
based on its default value, without a question. Like any other edit it must be saved with
"Save Changes". An unused entry keeps its name.

### Performance

Projects with many PDOs (e.g. 50 RPDOs with 10 to 20 mapped objects each) must stay responsive:
selecting a PDO, a mapped object, or an object dictionary entry takes well below 100 ms. All tabs
stay rendered and are only hidden, so template bindings must not rebuild data from the whole
document. Derived data such as the PDO list, the graphical PDO cells, and the list of mappable
objects is computed once per document revision; every change increments the revision of the device.
