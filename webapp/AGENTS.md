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
and PDOs. Multiple devices can be open at the same time. Each open device remembers its active tab:
switching to another device and back shows the tab that was active before. A newly opened device
starts with "Device Info". Each device also remembers where the user was in the views: in "Object
Dictionary" the selected object and sub-index and the collapsed lists, in "TX PDO Mapping" and
"RX PDO Mapping" the selected PDO and the zoom level. The selected rows are scrolled into view. XDD 1.0 files can be opened; saving
produces a normalized XDD 1.1 file. Additional XML fragments outside of identity,
file information, object dictionary, baud rates, and network features are not preserved.

The web UI should replicate the CANopenEditor EDSEditorGUI with the older WinForms interface.
All labels within the UI remain in their original English language and are not translated.

The start page offers the buttons "New", "Open", and "Open example XDD". "New" asks in the dialog
"New project" whether to create an "Empty project" or a project with the "DS301 profile" (all
objects of `DS301_profile.xpd`); "Cancel" creates nothing. The two choices stand together on the
left, "Cancel" on the right. The example project is `demo_io.xdd`
(`webapp/public/demo_io.xdd`). There is no notice line
below the header: no notice is shown when a device is created, a file is opened or saved, or
objects are cloned or inserted from a profile. In the "Devices" column, projects
with changes that are not saved yet are highlighted in color (light red background, red border, and
"modified" in red).

Questions to the user use an in-app overlay window with "OK" and "Cancel" instead of `confirm()`.
Errors and warnings use an in-app overlay window that must be acknowledged with "OK". In all these
windows "OK" (or the buttons that replace it, e.g. "Apply") is on the left and "Cancel" on the right;
the same applies to "Create" and "Cancel" in "Create new OD Index".
Closing a project with unsaved changes ("×" in "Devices") asks with the buttons "Close without
saving" and "Cancel".

"Save" in the header uses the save dialog of the browser (`showSaveFilePicker`, Chromium/Chrome/
Edge) with the XDD file name as proposal. Only a written file marks the project as saved and takes
the chosen file name; cancelling the dialog or a write error (error window) keeps it marked as
modified. Browsers without this dialog (e.g. Firefox) get a download instead; the page cannot notice
a cancelled download, so the project then counts as saved.
These windows, the "Unapplied Changes" questions, and "Create new OD Index" can be moved with the
mouse by dragging their title (grab cursor, grabbing while dragging); they stay inside the browser window, and every newly
opened window starts centered. "Insert Profile" and "Insert OD Objects" (Clone) are not movable,
because clicking their background closes them.

### Layout

The following images show the prescribed layout for each tab.

#### Tab "Device Info" 

![Tab Device Info](images/Template_Tab_Device_Info.png)

"Granularity" accepts only whole numbers from 1 to 64, "No of monitored nodes" only whole numbers
from 0 to 127. The value is checked when the field is left, with Enter, or with the arrows. A wrong
value is never replaced automatically: a warning names the allowed range and offers the correction
(nearest limit, or the rounded value). "OK" takes the correction, "Cancel" keeps the previous value.
Empty or non-numeric input shows the warning and keeps the previous value.

"No of monitored nodes" follows 0x1016 Consumer heartbeat time: an entry is used when sub-index
0x00 counts it and both node ID (bits 16..23) and heartbeat time (bits 0..15) are non-zero (values
that are no plain number, e.g. `$NODEID` expressions, count as used). When the number of used entries
grows beyond "No of monitored nodes", the value is raised to that number; a larger value is kept and
the value is never lowered automatically. The user may change it afterwards; a value below the
number of used 0x1016 entries shows a warning (only "OK", the value is kept). The "Refresh" button
next to the field counts the used 0x1016 entries again and sets the value to exactly that number
(this may also lower it).

The PDOs are checked against the granularity G (bits): the PDO is divided into units of G bits
(G = 8: bytes). A mapped object fits if it lies within one unit (several small objects may share a
unit, e.g. three 1-bit objects and a 5-bit object in one byte) or if it starts and ends on unit
boundaries (e.g. a 16-bit object at bit 0 or 8 with G = 8). An object that crosses a unit boundary
does not fit (e.g. four 1-bit objects and a 5-bit object: the 5-bit object covers bits 4..8).
Granularity 1 accepts everything. A dummy object (0x0001..0x0007) that ends on a unit boundary
fills up to that boundary and always fits, whatever its width (e.g. G = 8: a 1-bit object followed
by a 15-bit Dummy UInt16). Independent of the granularity (also for 0 or 1), every byte of the PDO
must be filled up: if the total length of the mapped objects is no multiple of 8 bits, the last byte
is reported (e.g. three 1-bit objects: "byte 0 is not filled up (3 of 8 bits used)"); it can be
filled e.g. with a dummy object. A warning lists every mapped object that does not fit (PDO, mapping
entry, object, length, bit range) and every byte that is not filled up, each on one line without
wrapping (the dialog widens to the longest line, at most to the window width; the explanation above
and the question below wrap within that width). All items are listed; with more than 8 items the
list scrolls vertically:

- after the granularity is changed in "Device Info" (the new value is kept, only "OK"),
- when a PDO is saved in "TX PDO Mapping" or "RX PDO Mapping",
- when a sub-object of a PDO mapping object is saved in "Object Dictionary".

When applying, the warning asks "Apply anyway?" with "Apply" on the left and "Cancel" on the right:
"Apply" applies, "Cancel" keeps the unapplied changes.

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

The "Data Type" selection offers only BOOLEAN, INTEGER8/16/32/64, UNSIGNED8/16/32/64, REAL32/64,
VISIBLE_STRING, OCTET_STRING, UNICODE_STRING, and DOMAIN. If an object already has another data type
(e.g. UNSIGNED24 from an opened file), that type stays selectable for this object at the top of the
list and is kept unless another type is chosen.

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
  and "Remove Item". Inserting always adds a "Dummy Bool" (0x0001) placeholder (1 bit with "Bitwise
  mapping", otherwise 8 bits) that is selected afterwards. If the free space is not sufficient, the usual warning is shown.
- Like the desktop editor, a disabled communication object (e.g. 0x1404/0x1804 with `CO_disabled`
  in `DS301_profile.xpd`) is no PDO: it is not shown in the PDO tabs, not counted in "RPDO count" /
  "TPDO count", and not checked against the granularity. The counts are recalculated on open and
  after every change (e.g. Toggle in "Object Dictionary"). "Add new PDO" still skips its index.
- The COB and Index columns are shown in hexadecimal (e.g. `0x40000180`, `0x1800`). The COB column
  shows the full 32-bit COB-ID with 8 hex digits, including the flag bits, but without `$NODEID` (as
  prefix or suffix). The "COB" field in "Communication parameters" keeps the full value.
- The ID, COB, and Index columns, the bit numbers, and the byte labels show the normal mouse
  pointer, not the text cursor, because nothing is typed there.
- The selected PDO is clearly highlighted: a dark blue frame with a shadow, dark blue ID, COB, and
  Index cells with white bold text, and a light blue background behind its bits.

#### Available Objects for PDO

- Objects for a PDO are chosen from the "Available Objects for PDO" list. Select an element in
  the PDO, then select the corresponding object in the list. Selecting a PDO element that is
  already assigned automatically selects the matching object in the list and scrolls it to
  roughly the middle of the visible list.
- If no element is selected in the PDO, no object can be selected in the list.
- The list always starts with the following dummy objects, which can always be selected:

| Name         | Object index | Sub-index |
|--------------|--------------|-----------|
| Dummy Bool   | 0x0001       | 0x00      |
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
- The communication parameters follow the comments of `DS301_profile.xpd` (CiA 301):
  - COB-ID: bit 31 = PDO does not exist / is not valid; for a TPDO bit 30 = no RTR allowed;
    bits 0..10 = 11-bit CAN-ID; all other bits (RPDO 11..30, TPDO 11..29) must be 0. `$NODEID` may
    stand before (`$NODEID+0x180`) or after (`0x180+$NODEID`) the number and keeps its position.
  - "Invalid" sets or clears only bit 31; CAN-ID, other bits, `$NODEID` and the number of hex digits
    stay unchanged. A COB that is no plain number (with optional `$NODEID`) is not changed; a warning
    is shown instead.
  - Type (transmission type): 0..240 synchronous, 241..253 not used, 254/255 event-driven.
  - Inhibit time in multiples of 100 µs and Event timer in ms: 0..65535. SYNC start value: 0..240.
  - Values outside these rules show a warning when the field is left; the value is kept.
- "Add new PDO" creates the objects like `DS301_profile.xpd`: RPDO sub-indices 0x00 (0x05),
  0x01 "COB-ID used by RPDO", 0x02, 0x05; TPDO 0x00 (0x06), 0x01 "COB-ID used by TPDO", 0x02, 0x03,
  0x05, 0x06 "SYNC start value"; mapping sub-index 0x00 "Number of mapped application objects in PDO".
  The first four PDOs get `$NODEID+0x200`..`0x500` (RPDO) and `$NODEID+0x40000180`..`0x40000480`
  (TPDO, no RTR); further PDOs start invalid (`0x80000000`). Transmission type is 255.

#### Saving PDO changes

Changes to a PDO in "TX PDO Mapping" and "RX PDO Mapping" must be saved explicitly, as in the
"Object Dictionary" tab. This covers the communication parameters, the indices, "Bitwise mapping",
and the mapped objects (assigning, bit width, "Insert Item before/after", "Remove Item"). Unsaved
changes are kept in a draft of the PDO; the communication object and the PDO mapping object in the
object dictionary are updated only when the PDO is saved. While the selected PDO has unsaved
changes, the "Apply" button is highlighted. Selecting another PDO, or "Add new PDO", then shows the
question "Unapplied Changes" with the buttons "Apply" and "Discard" side by side on the left
and "Cancel" on the right: "Apply" applies the changes, "Discard" discards them (including a
moved index), "Cancel" stays on the PDO. The same dialog is used in the "Object Dictionary" tab
(staying on the object); it shows no further explanation of the buttons. With "Auto Apply" checked, changes are saved
without the question.
"Delete PDO" deletes the PDO after its own confirmation.

#### Unsaved changes in both tabs

The edits of a PDO or an object are applied to the device with "Apply"; with "Auto Apply"
checked this happens without the button. In the "Object Dictionary" tab, "Auto Apply" is
left-aligned to the button above "Apply" (as in "Communication parameters"); both are right-aligned in the form; the button is a bit wider than the checkbox with its text and on the same
line as "Default value". (The "Save" button in the header still saves the project file.) If the
other tab has unapplied changes on the same objects, applying asks "... has unapplied changes.
Overwrite them?".

Changes in the "Object Dictionary" tab are written to the object only with "Apply" (or by
"Auto Apply"); until then the PDO tabs show the saved state. In the other direction, the
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
- the bit width of an entry does not exceed the width of the datatype of the mapped object; without
  "Bitwise mapping" the width is rounded up to whole bytes, so a BOOLEAN may be mapped with 8 bits;
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
"Apply". An unused entry keeps its name.

For a selected PDO mapping object, the header "Name" of the sub-object table contains the button
"Reset all". It resets the names of all active entries (same rules as "Reset Name") to the naming
scheme. Unsaved edits in the Object Dictionary are handled first by the usual "Unapplied Changes"
question; then a warning asks for confirmation ("OK" on the left, "Cancel" on the right), and unsaved edits of the same PDO in
the PDO tab need the usual overwrite confirmation. The new names are applied to the device at once,
without "Apply".

### Performance

Projects with many PDOs (e.g. 50 RPDOs with 10 to 20 mapped objects each) must stay responsive:
selecting a PDO, a mapped object, or an object dictionary entry takes well below 100 ms. All tabs
stay rendered and are only hidden, so template bindings must not rebuild data from the whole
document. Derived data such as the PDO list, the graphical PDO cells, and the list of mappable
objects is computed once per document revision; every change increments the revision of the device.
