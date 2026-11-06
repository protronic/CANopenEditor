# GUIDANCE.md – Reconstruction guide for the CANopen Editor web app

This document describes the structure, the layout, and the behavior of the Angular web app in
`webapp/` in enough detail to rebuild it from scratch. It complements `AGENTS.md` (requirements and
working rules) and the layout templates in `webapp/images/`. Where this guide and `AGENTS.md`
differ, `AGENTS.md` is the binding specification; this guide describes how the current code
implements it.

All UI texts are English and must be reproduced literally (they are quoted in this document).

---

## 1. Purpose and scope

- A browser replacement for the WinForms `EDSEditorGUI` of the CANopenEditor (`main` branch).
- Edits CANopen device descriptions: device information, object dictionary (OD), RX/TX PDO mapping.
- **Only XDD** (CiA 311) is read and written. XDD 1.0 and 1.1 can be opened; saving always writes a
  normalized XDD 1.1. EDS, DCF, XDC, documentation, and C sources are neither imported nor exported.
  XML fragments outside identity, file information, object dictionary, baud rates, and network
  features are not preserved.
- Several devices (projects) can be open at the same time.
- No backend: everything runs in the browser. Static assets (example project, profiles) are served
  from `public/`.

Not implemented on purpose (present in the desktop templates): the menu bar (`File`, `Insert
Profile`, `Reports`, `Tools`), the `Modules` tab, EDS/DCF/CANopenNode export, and the "100 kbps"
baud rate checkbox (the template does not show it either).

---

## 2. Technology and project setup

| Item | Value |
|------|-------|
| Framework | Angular 19.2 (standalone components, signals, new control flow `@if`/`@for`) |
| Language | TypeScript 5.7, `strict`, `strictTemplates` |
| Forms | `FormsModule` (`ngModel`) only, no reactive forms |
| Change detection | zone.js with `provideZoneChangeDetection({ eventCoalescing: true })` |
| Build | `@angular/build:application`, output `dist/canopen-editor-web`, assets from `public/` |
| Tests | Vitest 3 with `jsdom`, files `src/**/*.spec.ts` |
| License | GPL-3.0-only |

`package.json` scripts:

```json
{
  "start": "ng serve --host 0.0.0.0 --port 4200",
  "build": "ng build",
  "test": "vitest run"
}
```

Dependencies: `@angular/common`, `compiler`, `core`, `forms`, `platform-browser` (^19.2.14),
`rxjs` ~7.8, `tslib`, `zone.js` ~0.15. Dev: `@angular/build`, `@angular/cli` (^19.2.15),
`@angular/compiler-cli`, `jsdom` ^26, `typescript` ~5.7, `vitest` ^3.2.

`angular.json`: one project `canopen-editor-web`, prefix `app`, `sourceRoot: src`, styles
`src/styles.css`, production budget 1 MB warning / 2 MB error, `outputHashing: all`; serve defaults
to the development configuration (no optimization, source maps).

`tsconfig.json`: `target ES2022`, `module preserve`, `moduleResolution bundler`, `lib [ES2022, DOM]`,
`noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`,
`noFallthroughCasesInSwitch`, `experimentalDecorators`, `importHelpers`. `tsconfig.app.json` excludes
`*.spec.ts`.

`src/index.html`: `<title>Object Dictionary Editor</title>`, `lang="en"`, `<app-root>`.
`src/main.ts`: imports `zone.js`, bootstraps `AppComponent`.

### 2.1 File layout

```text
webapp/
  AGENTS.md                 requirements and working rules (binding)
  GUIDANCE.md               this file
  images/                   layout templates (screenshots of the desktop editor)
    Template_Tab_Device_Info.png
    Template_Tab_Object_Dictionary.png
    Template_Tab_Object_Dictionary_Clone_Object.png
    Template_Tab_TX_PDO_Mapping.png
    Template_Tab_RX_PDO_Mapping.png
  public/
    demo_io.xdd             example project ("Demo-IO")
    profiles/               copies of EDSEditorGUI/Profiles
      DS301_profile.xpd  DS301_profile_old.xpd  DS401_profile.xpd  DSP302-NMTMaster.xpd
  src/
    index.html  main.ts  styles.css
    app/
      app.component.ts              shell: header, Devices column, tabs, start page, save/open
      dialog-host.component.ts      renders the queued in-app dialogs
      draggable.directive.ts        moves modal windows by their title
      device-info.component.ts      tab "Device Info"
      object-dictionary.component.ts tab "Object Dictionary"
      pdo-view.component.ts         tabs "TX PDO Mapping" / "RX PDO Mapping" (one component)
      insert-profile.component.ts   dialog "Insert Profile"
      clone-objects.component.ts    dialog "Insert OD Objects" (Clone...)
      model/device.ts               data model, constants, OD helpers
      state/project.store.ts        open devices, dirty flag, revision, save/serialize
      state/dialog.service.ts       queue for confirm/choose/error/warning
      state/unsaved-edits.service.ts unapplied edits of the views (cross-tab conflicts)
      state/view-state.service.ts   per-device memory of selections
      xdd/xdd-codec.ts              XDD parser and writer
      xdd/pdo.ts                    PDO logic: slots, mapping, COB-ID, drafts, checks
      xdd/heartbeat.ts              0x1016 consumers / "No of monitored nodes"
      xdd/profiles.ts               profile list, offsets, insert rows
      xdd/clone.ts                  clone rows and copying
      **/*.spec.ts                  Vitest tests
```

---

## 3. Architecture

### 3.1 Components and services

```text
AppComponent (app-root)
 ├─ header buttons: New, Open, Save, Example, Insert Profile
 ├─ aside "Devices" (list of OpenDevice)
 ├─ main: tabs + four panes (all rendered, inactive ones [hidden])
 │   ├─ DeviceInfoComponent        [document] (changed)
 │   ├─ ObjectDictionaryComponent  [document] [revision] (changed)
 │   │    ├─ context menus, "Create new OD Index", "Unapplied Changes"
 │   │    └─ CloneObjectsComponent  [objects] (closed)
 │   ├─ PdoViewComponent direction="rx"  [document] [revision] (changed)
 │   └─ PdoViewComponent direction="tx"  [document] [revision] (changed)
 ├─ InsertProfileComponent (when profileOpen) (closed) (inserted → tab "od")
 └─ DialogHostComponent (always present, z-index above everything)

Services (providedIn: 'root'):
  ProjectStore, DialogService, UnsavedEditsService, ViewStateService
```

### 3.2 Data flow

- `ProjectStore.devices` is a signal of `OpenDevice { id, fileName, dirty, document, revision }`.
  `selectedId` is a signal; `selected` is a computed signal.
- Views mutate the `DeviceDocument` **in place** and emit `changed`. The shell then calls
  `store.touch(id)`, which:
  1. recalculates `nrOfRxPdo` / `nrOfTxPdo` from the enabled PDO communication objects,
  2. calls `syncMonitoredNodes(document)` (raises "No of monitored nodes" if needed),
  3. replaces the `OpenDevice` with `dirty: true` and `revision + 1`.
- `revision` is passed to the OD and PDO views. Derived data (PDO list, PDO cells, mappable objects)
  is computed in `computed()` signals that depend on `revision` (and a local `edits` counter), never
  directly in template bindings. This keeps projects with 50 PDOs responsive (< 100 ms per click).
- Edits in the OD and PDO tabs are first kept in a **draft** and only written to the document with
  **Apply** (or **Auto Apply**). Device Info writes immediately.
- `UnsavedEditsService` holds, per view (`'od'`, `'pdo-rx'`, `'pdo-tx'`), the unapplied edit with
  the document, the affected object indices, a label and a `discard()` callback. Before applying,
  a view asks for conflicts on the same indices and offers to overwrite them.
- `ViewStateService` stores per `DeviceDocument` (WeakMap) and per view the selection, so switching
  devices restores the previous position.
- The bitwise-mapping flag of a PDO is editor state, stored in a module-level
  `WeakMap<DeviceDocument, Map<commIndex, boolean>>` in `xdd/pdo.ts`; it is not written to the XDD.

---

## 4. Data model (`model/device.ts`)

```ts
type SchemaVersion = '1.0' | '1.1';
type ObjectTypeName = 'NULL' | 'DOMAIN' | 'DEFTYPE' | 'DEFSTRUCT' | 'VAR' | 'ARRAY' | 'RECORD';
type DataTypeName = 'UNKNOWN' | 'BOOLEAN' | 'INTEGER8' | 'INTEGER16' | 'INTEGER24' | 'INTEGER32'
  | 'INTEGER40' | 'INTEGER48' | 'INTEGER56' | 'INTEGER64' | 'UNSIGNED8' | 'UNSIGNED16'
  | 'UNSIGNED24' | 'UNSIGNED32' | 'UNSIGNED40' | 'UNSIGNED48' | 'UNSIGNED56' | 'UNSIGNED64'
  | 'REAL32' | 'REAL64' | 'VISIBLE_STRING' | 'OCTET_STRING' | 'UNICODE_STRING' | 'TIME_OF_DAY'
  | 'TIME_DIFFERENCE' | 'DOMAIN' | 'PDO_COMMUNICATION_PARAMETER' | 'PDO_MAPPING'
  | 'SDO_PARAMETER' | 'IDENTITY';
type AccessType = 'const' | 'read' | 'write' | 'readWrite' | 'readWriteInput'
  | 'readWriteOutput' | 'noAccess' | 'unknown';
type PdoMapping = 'no' | 'default' | 'optional' | 'TPDO' | 'RPDO';
type SrdoAccess = 'no' | 'tx' | 'rx' | 'trx';

interface OdEntry {
  index: number; subIndex: number; name: string;
  objectType: ObjectTypeName; dataType: DataTypeName; access: AccessType; pdoMapping: PdoMapping;
  defaultValue: string; actualValue: string; lowLimit: string; highLimit: string;
  description: string; denotation: string; disabled: boolean;
  countLabel: string; storageGroup: string; flagsPdo: boolean; accessSrdo: SrdoAccess;
  stringLengthMin: number;
  subObjects: OdEntry[];            // sub-objects of ARRAY/RECORD (VAR entries)
}

interface DeviceDocument {
  schemaVersion: SchemaVersion;
  fileName, fileVersion, fileCreator, fileCreationDate, fileCreationTime,
  fileModifiedBy, fileModificationDate, fileModificationTime: string;
  description, vendorName, vendorId, productName, productId, orderCode,
  versionSw, versionFw, versionHw: string;
  baudRates: { b10, b20, b50, b100, b125, b250, b500, b800, b1000, auto: boolean };
  granularity: number; nrOfRxPdo: number; nrOfTxPdo: number;
  bootUpSlave, bootUpMaster, lssSlave, lssMaster, ngSlave, ngMaster: boolean;
  nrOfNgMonitoredNodes: number; groupMessaging: boolean; dynamicChannels: boolean;
  dummy: boolean[];                 // 7 entries, Dummy0001..Dummy0007 usage
  objects: OdEntry[];               // kept sorted by index, sub-objects by sub-index
}
```

Constants and helpers:

- `DATA_TYPES` (offered in "Data Type"): `BOOLEAN, INTEGER8, INTEGER16, INTEGER32, INTEGER64,
  UNSIGNED8, UNSIGNED16, UNSIGNED32, UNSIGNED64, REAL32, REAL64, VISIBLE_STRING, OCTET_STRING,
  UNICODE_STRING, DOMAIN`. `dataTypeChoices(current)` prepends a current type that is not in the
  list (e.g. `UNSIGNED24` from a file) so it stays selectable.
- `OBJECT_TYPE_CODE` (VAR 7, ARRAY 8, RECORD 9, DOMAIN 2, DEFTYPE 5, DEFSTRUCT 6, NULL 0) and the
  inverse; `DATA_TYPE_BY_CODE` (CiA 301 codes 0x01..0x23, e.g. 0x07 UNSIGNED32, 0x1B UNSIGNED64).
- `STORAGE_GROUPS = ['RAM', 'ROM', 'EEPROM', 'PERSIST_COMM', 'PERSIST_APP']`.
- `BAUD_OPTIONS`: key, label (`10 kbps` … `1000 kbps`, `auto`), XML value (`10 Kbps` …,
  `auto-baudRate`).
- `createEmptyDocument()`: schema 1.1, `fileName 'project.xdd'`, `fileVersion '1'`,
  `productName 'New Product'`, versions `'0'`, granularity 8, everything else empty/false/0.
- `createEntry(partial)`: defaults `subIndex 0`, `objectType VAR`, `dataType UNSIGNED32`,
  `access readWrite`, `pdoMapping no`, `storageGroup RAM`, empty strings.
- `hex4`, `hex2`: uppercase, zero-padded. `parseUserIndex`: `(0x)?[0-9a-f]{1,4}`.
- `OBJECT_GROUP_RANGES`: communication 0x1000–0x1FFF, manufacturer 0x2000–0x5FFF,
  profile 0x6000–0xFFFF. `nextFreeIndex(objects, group, after)`: next unused index after `after`
  (or after the last object of the range, or the range start if empty), wrapping to the start.
- `bitLength(type)`: BOOLEAN 1; 8/16/24/32/40/48/56/64 by name; UNICODE_STRING 16; REAL32 32;
  REAL64 64; TIME_OF_DAY/TIME_DIFFERENCE 48; DOMAIN 0; default 8.
- `addSubObject`: only ARRAY/RECORD; first free sub-index; sub 0 is `Highest sub-index supported`
  (UNSIGNED8, const), others `Sub XX` with the parent's type/access; then `refreshSubZero`
  (sub 0 default = highest sub-index, hex if it was hex).
- `ensureXddName(fileName, productName)`: base name without path and `.xdd`, unsafe characters
  replaced by `_`, `project` as fallback, then `.xdd`.
- `formatDate` `YYYY-MM-DD`, `formatTime` `HH:MM:SS`.

---

## 5. XDD reading and writing (`xdd/xdd-codec.ts`)

### 5.1 Parsing (`parseXdd(xml)`)

1. Strip a BOM and trim. Empty → `XddFormatError('The file is empty.')`. Text starting with `[` →
   `'EDS, DCF and other formats are not read. Only XDD is supported.'`.
2. `DOMParser` (`text/xml`). Parser error → `'The XDD document is not valid XML.'`. Root must be
   `ISO15745ProfileContainer`, otherwise `'The file is not a CANopen XDD (ISO15745ProfileContainer).'`.
3. Schema version from the root namespace: contains `/1.0` → 1.0; `/1.1` or none → 1.1; otherwise
   `The XDD namespace is not supported: …`.
4. Collect all `parameter` elements by `uniqueID` and all `array` type definitions (element type).
5. For each `ISO15745Profile/ProfileBody`: device profile (ProfileClassID `Device`, xsi:type
   `ProfileBody_Device…`, or a `DeviceIdentity` child) → file attributes and identity (vendorName,
   vendorID, productName, productID, orderNumber, productText/description, version SW/FW/HW);
   network profile → baud rates (`supportedBaudRate value`), `CANopenGeneralFeatures`
   (granularity, nrOfRxPDO, nrOfTxPDO, bootUpSlave, layerSettingServiceSlave, ngSlave, ngMaster,
   NrOfNG_MonitoredNodes, groupMessaging, dynamicChannels), `CANopenMasterFeatures` (bootUpMaster,
   layerSettingServiceMaster), `dummy entry="Dummy000N=0|1"`.
6. Every `CANopenObject` becomes an `OdEntry` (first one per index wins): `index` hex, `name`,
   `objectType` (code or name), `dataType` (hex code attribute), `PDOmapping`, defaultValue,
   actualValue, lowLimit, highLimit, denotation, `edseditor_extenstion_storagelocation` (storage
   group), `edseditor_extension_notifyonchange` (flagsPdo). `accessType` `rw/ro/wo/rwr/rww/const`
   (or long names) is mapped; `readWrite` becomes `readWriteOutput` for RPDO and `readWriteInput`
   for TPDO mapping. Then the referenced `parameter` (via `uniqueIDRef`) is applied. Each
   `CANopenSubObject` is read the same way; missing names become `Sub XX`. A VAR with
   sub-objects becomes RECORD.
7. Applying a `parameter`: description, label (as name if empty), `access`, data type from a direct
   type tag (`BOOL, SINT, INT, DINT, LINT, USINT, UINT, UDINT, ULINT, BYTE, WORD, DWORD, LWORD, CHAR,
   REAL, LREAL, STRING, WSTRING, BITSTRING`) or a `dataTypeIDRef` to an array; `BITSTRING` with an
   empty default is DOMAIN, otherwise OCTET_STRING; `defaultValue`, `allowedValues` min/max,
   `actualValue`, `denotation`, and the properties `CO_disabled`, `CO_countLabel`,
   `CO_storageGroup`, `CO_flagsPDO`, `CO_accessSRDO`, `CO_stringLengthMin`.
8. Without any `CANopenObject`, objects are built from parameters `UID_OBJ_IIII` and
   `UID_SUB_IIIISS` (XDD 1.0 style).
9. Sort; an empty product name becomes `Unnamed`.

### 5.2 Writing (`writeXdd(document, now)`)

Writes, with two-space indentation and `\n` line ends:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!--File is generated by CANopen Editor Web. Only the XDD device description (CiA 311) is read and written.-->
<ISO15745ProfileContainer xmlns:xsd=… xmlns:xsi=… xmlns="http://www.canopen.org/xml/1.1">
  <ISO15745Profile>
    <ProfileHeader …>(CANopen device profile, ProfileRevision 1.1, ProfileClassID Device)</ProfileHeader>
    <ProfileBody xmlns:q1=… xsi:type="q1:ProfileBody_Device_CANopen" formatName="CANopen" formatVersion="1.0"
                 fileName=… fileCreator=… fileCreationDate=… fileCreationTime=… fileModifiedBy=…
                 fileModificationDate=… fileModificationTime=… fileVersion=… supportedLanguages="en" xmlns="">
      <q1:DeviceIdentity> vendorName, vendorID, productName, productID, [productText/description],
                          [orderNumber], version SW/FW/HW </q1:DeviceIdentity>
      <q1:DeviceFunction> one characteristic "SW library" = "CANopen Editor Web" </q1:DeviceFunction>
      <q1:ApplicationProcess>
        <q1:dataTypeList>  q1:array UID_ARR_IIII (subrange 0..n-1, element type) /
                           q1:struct UID_REC_IIII (varDeclaration UID_RECSUB_IIIISS per sub) </q1:dataTypeList>
        <q1:parameterList> q1:parameter UID_OBJ_IIII and UID_SUB_IIIISS per object/sub:
                           [access], description or label, type tag or dataTypeIDRef, defaultValue,
                           allowedValues/range, actualValue, denotation, CO_* properties </q1:parameterList>
      </q1:ApplicationProcess>
    </ProfileBody>
  </ISO15745Profile>
  <ISO15745Profile>
    <ProfileHeader …>(CANopen communication network profile, ProfileClassID CommunicationNetwork)</ProfileHeader>
    <ProfileBody … xsi:type="q2:ProfileBody_CommunicationNetwork_CANopen" …>
      <ApplicationLayers>
        <q2:CANopenObjectList> CANopenObject index name objectType [PDOmapping] uniqueIDRef [subNumber]
                               with CANopenSubObject subIndex name objectType="7" PDOmapping uniqueIDRef </q2:CANopenObjectList>
        <dummyUsage> Dummy0001..Dummy0007 = 0|1 </dummyUsage>
      </ApplicationLayers>
      <TransportLayers><PhysicalLayer><baudRate> supportedBaudRate … </baudRate></PhysicalLayer></TransportLayers>
      <NetworkManagement>
        <CANopenGeneralFeatures granularity=… [nrOfRxPDO] [nrOfTxPDO] [ngSlave] [ngMaster]
                                [NrOfNG_MonitoredNodes] [bootUpSlave] [layerSettingServiceSlave]
                                [groupMessaging] [dynamicChannels="1"] />
        <CANopenMasterFeatures [bootUpMaster] [layerSettingServiceMaster] />
      </NetworkManagement>
    </ProfileBody>
  </ISO15745Profile>
</ISO15745ProfileContainer>
```

Details: `access` is omitted for `read`/`unknown` (and for ARRAY/RECORD parents); sub-objects of an
ARRAY inherit the parent access when unknown. Type tags: BOOLEAN→BOOL, INTEGER8→SINT, 16→INT,
32→DINT, 64→LINT, UNSIGNED8→USINT, 16→UINT, 32→UDINT, 64→ULINT, REAL32→REAL, REAL64→LREAL,
VISIBLE_STRING→STRING, UNICODE_STRING→WSTRING; DOMAIN, OCTET_STRING, 24/40/48/56-bit types and
times → BITSTRING; default DINT. `CO_storageGroup` only when not `RAM`. Values are XML-escaped
(`& < > "`). Missing creation/modification stamps use `now`.

`ProjectStore.serialize()` sets the creation stamp if it is empty, always sets the modification
stamp to now, sets `fileName` (from the save dialog) and `schemaVersion = '1.1'`.

---

## 6. Global layout and styling (`src/styles.css`)

### 6.1 Design tokens

```css
--ink: #1c2422;  --muted: #5d675f;  --paper: #f3efe6;  --panel: #fffdf8;  --line: #ddd4c6;
--header: #1b2826;  --header-ink: #f6f1e7;  --accent: #b5522a;  --teal: #0f6e6b;  --danger: #8d2f2f;
--sans: "Segoe UI", "Noto Sans", "Liberation Sans", sans-serif;
--mono: "Cascadia Mono", "Noto Sans Mono", "Liberation Mono", ui-monospace, monospace;
```

- Default buttons: accent background (`#b5522a`), white text, radius 4px, padding `0.45rem 0.75rem`;
  `.quiet` transparent with border; `.active` (selected tab) dark header color; disabled 45% opacity.
- `button.system` (inside OD and PDO views): desktop-like grey button (`#f3f3f3`, border
  `#b7b0a4`, radius 3px). `button.system.dirty` (Apply with unapplied changes): `tomato` background,
  white text, border `#d4503a`.
- Inputs full width, border `--line`, radius 4px. Read-only / disabled inputs grey (`#e4e4e4` in
  Device Info/PDO, `#f3f3f3` in OD). `.peach` inputs `#ffdab9` (as in the desktop editor).
- Tables: collapsed borders, sticky header cells with `#ece7dc` background; `tr { cursor: pointer }`.

### 6.2 Shell

```text
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [OD] Object Dictionary Editor            [New] [Open] [Save] [Example] [Insert Profile] │  header (#1b2826)
│      XDD                                                                                 │
├──────────────┬───────────────────────────────────────────────────────────────────────────┤
│ Devices      │ [Device Info] [Object Dictionary] [TX PDO Mapping] [RX PDO Mapping]       │
│ ┌──────────┐ │                                  Opened as XDD 1.1. Save writes XDD 1.1   │
│ │Demo-IO  ×│ │ ┌───────────────────────────────────────────────────────────────────────┐ │
│ │demo_io.xdd│ │ │ active pane (the other three are rendered but [hidden])               │ │
│ └──────────┘ │ └───────────────────────────────────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────────────────────────────────┘
```

- `.shell`: full viewport height, column flex, no page scrolling.
- Header `.top`: dark background, logo square `.mark` (2.2rem, accent color, text "OD"), title
  "Object Dictionary Editor" with small "XDD". Buttons right: **New**, **Open**, **Save** (disabled
  without a selected device), **Example** (`.quiet`), **Insert Profile** (disabled without device).
  A hidden `<input type="file" accept=".xdd,application/xml">` is clicked by **Open**.
- `.workspace`: grid `280px | 1fr`. `aside` background `#ebe6dc`, title **Devices**.
- Device card `.device`: product name (bold, `Unnamed` if empty) and small file name; when dirty
  the small text gets ` · modified`. Active card: teal border plus outline. Dirty card: background
  `#fde4dc`, border `tomato`, small text `#b8341c` bold. A `×` button (aria-label "Close file")
  closes it. Empty list: "No device open."
- Main head: tab buttons in the order **Device Info**, **Object Dictionary**, **TX PDO Mapping**,
  **RX PDO Mapping** (active tab `.active`) and right the text
  `Opened as XDD {schemaVersion}. Save writes XDD 1.1`.
- There is **no notice/status line** anywhere.
- Below 860px width the grids collapse to one column.

### 6.3 Start page (no device open)

A panel `.empty` (max 42rem) with `<h2>Object Dictionary Editor</h2>`,
"Edit device information, the object dictionary, and PDO mapping.",
"Only the **XDD** file format is read and written." and the buttons **New**, **Open**,
**Open example XDD**.

### 6.4 Modal windows

- `.modal-back`: fixed full-screen overlay `rgb(28 36 34 / 35%)`, centered grid, z-index 50; the
  dialog host uses z-index 70 so its messages appear above other modals.
- `.modal`: width `min(26rem, 100vw - 2rem)`, panel background, radius 6px, padding 1rem, column
  flex, gap 0.65rem. `.modal-actions`: flex row, gap 0.5rem; `.modal-spacer { flex: 1 }` pushes the
  following buttons to the right.
- **Button rule:** confirming buttons (OK, Apply, Discard, Create, Insert, choices) on the left, a
  spacer, **Cancel** on the right.
- Movable windows (`appDraggable`): `.modal h3 { cursor: grab; user-select: none; touch-action:
  none }`, `.modal.dragging h3 { cursor: grabbing }`.
- Context menus `.menu`: fixed at the mouse position, white, min width 12rem, shadow, z-index 40;
  items are full-width left-aligned buttons, hover `#0a64c8` with white text. A click anywhere
  (`document:click`) closes the menu.

---

## 7. Shell behavior (`app.component.ts`, `state/project.store.ts`)

- **Active tab per device**: a signal `Record<deviceId, 'info' | 'od' | 'rx' | 'tx'>`; default
  `info`. Switching devices restores the tab; closing removes the entry.
- **New**: `dialogs.choose('Create an empty project or a project with the DS301 profile?',
  ['Empty project', 'DS301 profile'], 'New project')`. Cancel creates nothing. "DS301 profile"
  loads `profiles/DS301_profile.xpd`, parses it, and inserts all its objects (error:
  `DS301_profile.xpd could not be loaded.`). The new device is named `project.xdd`, is dirty, and
  becomes selected.
- **Open**: only `*.xdd` (case-insensitive), otherwise error
  `Only XDD files are read. Other formats are not imported or exported.`. Read with `FileReader`
  (error `The file could not be read.`); parse errors are shown in the error window. The file name
  is normalized with `ensureXddName`. Opened devices are not dirty.
- **Example / Open example XDD**: fetches `demo_io.xdd` (error
  `The example XDD could not be loaded.`).
- On create/open: PDO counts are recalculated and the used 0x1016 entries are remembered.
- **Save** (header):
  - If `window.showSaveFilePicker` exists (Chromium/Chrome/Edge): call it with
    `suggestedName = saveName(device)` and type `{ description: 'XDD file', accept:
    { 'application/xml': ['.xdd'] } }`. `AbortError` (dialog cancelled) → return, the device stays
    dirty. Then serialize with the chosen `handle.name`, write via `createWritable()`; on failure
    error `"<name>" could not be written.` and stay dirty; on success `markSaved(id, handle.name)`.
  - Otherwise (e.g. Firefox): download via a Blob URL and an `<a download>`; the device counts as
    saved (a cancelled download cannot be detected).
  - `markSaved` sets `dirty: false`, the new file name, and `revision + 1`.
- **Close (×)**: if dirty, `choose('"<name>" has unsaved changes. Close file?',
  ['Close without saving'])` (title "Confirm"); Cancel keeps it. After closing, the first
  remaining device is selected.
- **Insert Profile** opens `InsertProfileComponent`; after inserting, the tab switches to
  "Object Dictionary".

---

## 8. Dialog system (`state/dialog.service.ts`, `dialog-host.component.ts`, `draggable.directive.ts`)

`DialogService` replaces `confirm()`/`alert()`; requests are queued and shown one after another.

```ts
interface DialogContent { text: string; items?: readonly string[]; footer?: string; }
confirm(text | content, title = 'Confirm'): Promise<boolean>        // OK / Cancel
choose(text | content, choices, title = 'Confirm'): Promise<choice | null>  // choices / Cancel
error(text | content, title = 'Error'): Promise<void>               // OK
warning(text | content, title = 'Warning'): Promise<void>           // OK
```

Rendering (`DialogHostComponent`):

```text
┌ Warning ───────────────────────────────┐   h3 = title (drag handle)
│ text (pre-line, wraps)                  │   <p>
│ item 1 (one line, no wrap)              │   <ul class="dialog-items">, only if items
│ item 2 …                                │   max-height 12em (≈ 8 lines), scrolls vertically
│ footer (e.g. "Apply anyway?")           │   <p>, only if footer
│ [OK | choices…]  ············  [Cancel] │   Cancel only for kind "confirm"
└─────────────────────────────────────────┘
```

- Classes: `.modal.dialog-box` plus the kind (`confirm`, `error`, `warning`). Error title color
  `#b8341c`, warning title `#a86200`. Width `min(28rem, 100vw - 2rem)`; buttons min width 5rem.
- With items the box gets `.wide`: `width: fit-content`, `min-width: min(28rem, 100vw - 2rem)`,
  `max-width: 100vw - 2rem`; paragraphs use `width: 0; min-width: 100%` so they wrap within the
  width of the longest item. Items: `white-space: pre; line-height: 1.5`.
- The first button (`.dialog-ok`) gets the focus. **Escape** closes: confirm → Cancel, others → OK.
- `appDraggable` directive (bound value = the current dialog, so each new dialog starts centered):
  pointerdown on the `h3` (left button) starts dragging with pointer capture and adds the class
  `dragging`; pointermove translates the window (`transform: translate(x, y)`), clamped so it stays
  inside the viewport (a window larger than the viewport keeps its place); pointerup/cancel ends.
  Used for the dialog host, "Create new OD Index", and the "Unapplied Changes" windows. Not used for
  "Insert Profile" and "Insert OD Objects" (their background click closes them).

---

## 9. Tab "Device Info" (`device-info.component.ts`)

Layout follows `images/Template_Tab_Device_Info.png`:

```text
.info-layout: grid  1.15fr | 1fr
┌ Device Info ───────────────┐  ┌ Baudrates ┐ ┌ General and Master Features ──────┐
│ Product name   [        ]  │  │ □ 10 kbps │ │ Granularity          [ 8 ]          │
│ Product ID     [        ]  │  │ □ 20 kbps │ │ RPDO count           [ 1 ] (ro)     │
│ Vendor name    [        ]  │  │ □ 50 kbps │ │ TPDO count           [ 2 ] (ro)     │
│ Vendor ID      [        ]  │  │ □ 125 …   │ │ □ LSS Slave  □ LSS Master            │
└────────────────────────────┘  │ □ 250 …   │ │ □ Node guarding Slave                │
┌ File Info ─────────────────┐  │ □ 500 …   │ │ □ Node guarding Master               │
│ File version               │  │ □ 800 …   │ │ No of monitored nodes [0] [Refresh] │
│ Description                │  │ □ 1000 …  │ └──────────────────────────────────────┘
│ Creation Date/Time         │  │ □ auto    │ ┌ Device commissioning (all peach, ro) ┐
│ Created By                 │  └───────────┘ │ Concrete node ID, Node name, Baudrate,│
│ Modification Date/Time     │                │ Net number, Net name,                 │
│ Modified by                │                │ CANopen Manager (disabled checkbox),  │
└────────────────────────────┘                │ LSS Serial no                         │
┌ Project Info (read-only) ──┐                └───────────────────────────────────────┘
│ Project file (version) = file name; XDD v1.1 file - stripped; EDS file; DCF file;    │
│ CANopenNode file (ver); Documentation file (all empty)                              │
└──────────────────────────────────────────────────────────────────────────────────────┘
┌ Additional device information (spans both columns) ─────────────────────────────────┐
│ Revision number (ro, empty) | Order code (editable) | Commissioning network name (ro)│
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- Field rows `.info-line`: grid `11.2rem | 1fr`, font 0.82rem; the wide fieldset uses `15.5rem`.
  The right column is split (`.info-split`) into Baudrates (`minmax(8.5rem, 0.72fr)`) and General
  and Master Features (`1.35fr`). Fieldsets have legends at 0.82rem.
- Text fields write immediately to the document and emit `changed`. "Creation Date/Time" and
  "Modification Date/Time" show `date time`; on edit the text is split at the first space.
- Baud rate checkboxes for all options **except 100 kbps**.
- **Granularity** (number input, 1..64) and **No of monitored nodes** (0..127) are checked on
  `change` (leaving the field, Enter, spinner arrows):
  - Valid whole number in range → stored.
  - Finite but invalid (out of range or fraction) → `confirm('"<Label>" allows only whole numbers
    from <min> to <max>. Change the value <text> to <corrected>?', 'Warning')`; OK stores the
    corrected value (rounded and clamped), Cancel restores the old value.
  - Empty or non-numeric → `warning('"<Label>" allows only whole numbers from <min> to <max>.')`
    and the old value is restored. The field gets the focus again.
  - After a changed granularity, all enabled PDOs are checked (section 12.1); issues are shown with
    the footer "Adjust the PDO mapping or the granularity." (only OK, the value is kept).
  - After a changed "No of monitored nodes" below the number of used 0x1016 entries:
    `warning('0x1016 Consumer heartbeat time monitors <n> nodes, but "No of monitored nodes" is <v>.')`.
- **Refresh** (`button.system`, title "Count the used entries of 0x1016 Consumer heartbeat time")
  sets "No of monitored nodes" to exactly the number of used 0x1016 entries (max 127).
- RPDO/TPDO count are read-only and always the number of enabled PDO communication objects.

### 9.1 0x1016 Consumer heartbeat (`xdd/heartbeat.ts`)

- An entry is used when its sub-index is ≥ 1, it is counted by sub-index 0x00 (no sub 0 value →
  all count), and node ID (bits 16..23) and heartbeat time (bits 0..15) are both non-zero. Values
  that are no plain number (e.g. `$NODEID` expressions) count as used.
- `trackHeartbeatConsumers` remembers the count on open/create. `syncMonitoredNodes` (in every
  `touch`) raises "No of monitored nodes" to the new count when the count grew beyond it; a larger
  value is kept and the value is never lowered automatically.

---

## 10. Tab "Object Dictionary" (`object-dictionary.component.ts`)

### 10.1 Layout

Follows `images/Template_Tab_Object_Dictionary.png`, with these intentional differences: the three
lists are collapsible, and "Save Changes / Autosave changes" are now **Apply / Auto Apply** as shown.

```text
.od: grid 280px | 1fr, white, bordered
┌ ▾ Communication Specific Parameters ┐┌ Sub │ Name [Reset all] │ Obj Type │ Data Type │ SDO │ PDO │ SRDO │ Default Value ┐
│ Index  Name                         ││     │ Identity          │ RECORD   │           │     │     │      │               │ ← parent row
│ 0x1000 Device type                  ││0x00 │ Highest sub-index │ VAR      │ UNSIGNED8 │ ro  │ no  │ no   │ 0x04          │
│ …                                   ││0x01 │ Vendor-ID         │ VAR      │ UNSIGNED32│ ro  │ no  │ no   │ 0x0           │ (selected: #0a64c8)
├ ▾ Manufacturer Specific Parameters  ┤└──────────────────────────── sub table: 34 % of the height ─────────────────────────┘
│ …                                   │ Index [0x1018]   Sub Index [0x01]
├ ▾ Device Profile Specific Parameters┤ Name  [                                              ] [Reset Name]
│ …                                   │ Denotation [ peach                                              ]
└─────────────────────────────────────┘ Description [ textarea, monospace, fills the free height       ]
                                        ┌ Object settings ───────────────────────────────────────────────┐
                                        │ Object Type [VAR ▾](dis) │ HighLimit [   ]   │ Count Label [ ▾]  │
                                        │ Data Type   [      ▾]    │ LowLimit  [   ]   │ Storage Group [▾] │
                                        │ Access SDO  [rw ▾]       │ Actual Value[peach]│ Enabled ☑        │
                                        │ Access PDO  [tr ▾]       │ String Len Min [0] │                   │
                                        │ Access SRDO [no ▾]       │                    │   □ Auto Apply    │
                                        │ Default value [                       ]      │   [   Apply    ]  │
                                        └────────────────────────────────────────────────────────────────┘
```

- Left `.od-groups` (`#f7f4ee`): three stacked sections that share the height equally
  (`flex: 1 1 0`); a collapsed section shrinks to its header. Each header `h3` (`#e4dccb`, 0.78rem,
  bold, the "highlighted beginning of each list") has a collapse button `▾`/`▸`
  (`aria-expanded`). Each list is a scrolling table with sticky header `Index | Name`; index in
  monospace `0xIIII`, name cut with an ellipsis at 11rem. Selected rows (primary and extra
  selection): bold, background `#e4eef8`. Disabled objects: text `#b0b0b0`. Rows are not text
  selectable. Groups by index: 0x1000–0x1FFF, 0x2000–0x5FFF, 0x6000–0xFFFF.
- Right `.od-main`: sub table (`flex: 0 0 34%`) and below it the scrolling form `.od-form`.
- Table cells `0.16rem 0.35rem`, font 0.8rem, no wrapping; sticky header `#ece7dc`.
- Form rows `.od-line`: label span `6.4rem`, then the control. Index and Sub Index are read-only,
  6.2rem wide, side by side. Read-only inputs `#f3f3f3`.
- **Object settings** fieldset: grid of three columns `1.25fr | 1.05fr | 1.15fr`, gap
  `0.35rem 0.8rem`, in this order (empty cells are `<span>`):
  1. Object Type | HighLimit | Count Label
  2. Data Type | LowLimit | Storage Group
  3. Access SDO | Actual Value (peach) | Enabled (checkbox)
  4. Access PDO | String Len Min (number) | –
  5. Access SRDO | – | –
  6. Default value (spans two columns, `align-self: end`) | `.save-row`
- `.save-row`: a grid aligned right and bottom (`justify-self: end; align-self: end; gap 0.35rem`):
  the checkbox **Auto Apply** on top, left-aligned to the button, and the button **Apply** below it,
  on the line of "Default value", `min-width: 7rem`, `padding-block: 0.275rem` (same height as the
  input). Apply is `.dirty` (tomato) while the draft differs from the object, disabled when nothing
  is selected.

### 10.2 Form controls and draft

- The form edits a **draft** of the selected entry: the parent object if no sub-index is selected,
  otherwise the sub-object. `dirty` = JSON snapshot of all draft fields differs from the baseline
  taken when the entry was loaded.
- Enabled controls:
  - Name, Denotation, Description: always when an entry is selected.
  - Data Type, Access SDO/PDO/SRDO, Default value, Actual Value, Low/HighLimit, String Len Min:
    only for VAR entries (other types show empty values).
  - Count Label, Storage Group, Enabled: only for the parent object (no sub selected).
  - Object Type: always disabled (shows the type).
- **Data Type** options: `dataTypeChoices(current)` (section 4).
- **Access SDO** options `no, ro, wo, rw`. Display: const/read → ro, write → wo, readWrite/
  readWriteInput/readWriteOutput → rw, others → no. Selecting: ro → `read`, wo → `write`,
  rw → `readWriteOutput` if Access PDO is `r`, `readWriteInput` if `t`, else `readWrite`;
  no → `noAccess`.
- **Access PDO** options `no, t, r, tr`. Display: TPDO → t, RPDO → r, optional/default → tr.
  Selecting: t → `TPDO`, r → `RPDO`, tr → `optional` (keeps `default`), no → `no`.
- **Access SRDO** options `no, tx, rx, trx`.
- **Count Label** / **Storage Group**: options are an empty label (Count Label only), the
  predefined storage groups, all values used in the document, values added in this session, the
  current value, and finally `Add...`, which asks for a new name with `window.prompt('Add Count
  Label')` / `window.prompt('Add Storage Group')`.
- In the sub table, the **SDO/PDO** columns use the same short forms; PDO shows `r` also for
  `readWriteOutput` access and `t` for `readWriteInput`. For ARRAY/RECORD parent rows only the name
  and object type are shown. An `UNKNOWN` sub data type is shown as the parent type.
- **Default value of a mapping entry** (sub ≥ 1 of 0x1600–0x17FF / 0x1A00–0x1BFF): when the new
  value maps another object than before (index/sub-index differ), the draft name is replaced by the
  generated name (section 11.8).

### 10.3 Apply, Auto Apply, and "Unapplied Changes"

- **Apply** (`saveChanges()`), only if dirty:
  1. For a VAR sub-object: `checkMappingObject` (section 12.2) – on an error a warning and nothing
     is written. Then the granularity check of the mapping object with the draft value; with issues
     `choose(granularityMessage(G, issues, 'Apply anyway?'), ['Apply'], 'Warning')`; Cancel keeps
     the draft.
  2. Conflicts with unapplied edits of a PDO tab on the same object:
     `confirm('<label> has unapplied changes. Overwrite them?', 'Warning')` for each; OK discards
     them, Cancel aborts.
  3. Write the draft (VAR fields only for VAR entries; Count Label, Storage Group, Enabled, flags
     only for the parent), reset the baseline, emit `changed`.
- **Guard** before every selection change, context-menu action, Add/Toggle/Reset all: if dirty and
  Auto Apply is checked → Apply; if dirty otherwise → the movable window

  ```text
  ┌ Unapplied Changes ──────────────────────────────────────────┐
  │ You have unapplied changes for index 0x1A01/02.              │
  │ Do you want to apply them and switch to a different object?  │
  │ [Apply] [Discard]  ························  [Cancel]        │
  └──────────────────────────────────────────────────────────────┘
  ```

  Apply → `saveChanges()` (may still fail), Discard → reload the draft, Cancel → stay. The label is
  `0xIIII/SS` (sub 00 for the parent). No further explanation of the buttons.
- The unapplied edit is registered in `UnsavedEditsService` as owner `'od'` with label
  `Index 0xIIII/SS in "Object Dictionary"`, indices `[entry.index]`, discard = reload the draft.
- When the document revision changes (e.g. a PDO tab applied), the draft is reloaded only if it is
  not dirty.

### 10.4 Selection and context menus

- Click selects an object (after the guard) and clears the sub selection.
- Ctrl/Cmd+click toggles extra objects; Shift+click selects the range between the primary and the
  clicked object within the same list. Extra selections are used by Clone, Delete, and Toggle.
- Right-click (also on the empty area of a list or on its header) opens the object menu at the
  mouse position. Right-clicking an object that is not selected selects it first (guard). The menu
  remembers the list and the object under the mouse for "Add...".
- Object menu: **Add...**, **Clone...**, **Delete...**, **Toggle** (the last three disabled without a
  selection).
  - **Add...** (guard) opens the movable form **Create new OD Index**: `Index (hex)` (proposed by
    `nextFreeIndex` of the list under the mouse: next free after the hovered object, or after the
    last object of the list, or the first index of the range), `Name` (`New Object`), fieldset
    `Object Type` with radio buttons VAR/ARRAY/RECORD; buttons **Create** (submit) left, spacer,
    **Cancel** right. Validation warnings: `Enter the index as a hex value between 0 and FFFF.`,
    `Please specify a name`, `Index IIII already exists.`. New VAR: UNSIGNED32, readWrite, default
    `0`. New ARRAY/RECORD additionally get sub 0x00 `Highest sub-index supported` (UNSIGNED8, read,
    `0x01`) and sub 0x01 `Sub Object 1` (UNSIGNED32, readWrite, `0`). The new object is selected.
  - **Clone...** opens "Insert OD Objects" for all selected objects (section 14).
  - **Delete...**: `confirm('Do you really want to delete the selected <n> items?')`; afterwards the
    first object is selected.
  - **Toggle** (guard): sets `disabled` of all selected objects to the inverse of the primary
    object's state (disabled objects are greyed out; disabled PDO communication objects are no PDOs).
- Right-click in the sub table opens the sub menu (selecting the row first): **Add** (ARRAY/RECORD:
  next free sub-index), **Remove (shift up)** (sub ≥ 1; later sub-indices move down by one),
  **Remove (leave gap)** (RECORD only). Sub 0x00 is refreshed to the highest sub-index.

### 10.5 Mapping objects: "Reset Name" and "Reset all"

- When a PDO mapping object (0x1600–0x17FF, 0x1A00–0x1BFF) is selected:
  - **Reset Name** (`button.system`) right of the Name input (the input shrinks). Enabled only for
    active entries: sub-index ≥ 0x01, counted by sub 0x00, mapping an object, mapping object not
    disabled. It puts the generated name (from the draft default value) into the Name field without
    a question; it must be applied with **Apply**.
  - **Reset all** (small `button.system`, 0.75rem) in the sub table header right next to "Name"
    (gap 0.75rem), title "Reset the names of all mapping entries to the naming scheme". Enabled if
    any active entry exists. Flow: guard → `confirm('Reset the names of all mapping entries of
    0xIIII to "Mapping index - Index/Subindex/Name"?\n\nNames changed by hand are lost. The change is
    applied immediately.', 'Warning')` → overwrite confirmation for unapplied PDO-tab edits of the
    same object → names written directly to the document (no Apply), `changed` emitted.

### 10.6 View state

On device switch the view stores `{ index, subIndex, collapsed }` for the old document and restores
it for the new one (default: first object, no sub, all lists expanded). Selected rows are scrolled
into view (`scrollIntoView({ block: 'nearest' })`).

---

## 11. Tabs "TX PDO Mapping" and "RX PDO Mapping" (`pdo-view.component.ts`, `xdd/pdo.ts`)

One component, `direction` `'tx'` or `'rx'`. TX: communication 0x1800–0x19FF, mapping
0x1A00–0x1BFF. RX: communication 0x1400–0x15FF, mapping 0x1600–0x17FF. Mapping index =
communication index + 0x200.

### 11.1 Layout

Follows `images/Template_Tab_TX_PDO_Mapping.png` / `…RX…`:

```text
.pdo-top: grid 1.45fr | minmax(20rem, 0.9fr)
┌ Available Objects for PDO ─────────────────────────────┐ ┌ Communication parameters ──────────────────────┐
│ Index  Sub  Name          Datatype   Bits [steps]      │ │ Communication [0x1800]          [Add new PDO] │
│ 0x0001 0x00 Dummy Bool    BOOLEAN    8                 │ │ Mapping       [0x1A00]          [Delete PDO ] │
│ 0x0002 0x00 Dummy Int8    INTEGER8   8                 │ │ COB  [0x40000180+$NODEID]       [  Apply   ] │
│ …  (max-height 17.5rem, scrolls; selected #0a64c8)     │ │      □ Invalid                  □ Auto Apply │
│ 0x2001 0x01 Input 1       INTEGER16  16  [-][+]        │ │ Type        [255]                             │
└────────────────────────────────────────────────────────┘ │ Inhibit     [100]   (disabled for RX)         │
                                                           │ Event Timer [200]                             │
                                                           │ Sync start  [0]     (disabled for RX)         │
                                                           │      □ Bitwise mapping                        │
                                                           └───────────────────────────────────────────────┘
┌ .map-scroll (horizontal + vertical scrolling, white) ──────────────────────────────────────────────────────┐
│ ID │ COB        │ Index  │ 0 1 2 3 4 5 6 7 8 9 10 … 63            (bit numbers; 0, 8, 16 … in tomato)     │
│    │            │        │ Byte 0 │ Byte 1 │ … │ Byte 7            (tomato / #b8341c alternating)          │
│ 1  │ 0x40000180 │ 0x1800 │ 0x2001/01/Input 1 │ 0x2001/02/Input 2 │ … │ Empty                              │
│ 2  │ 0x40000280 │ 0x1801 │ 0x2100/00/Temperature │ 0x2003/01/Input D1 │ …                               │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
[Zoom In] [Zoom Out]
```

- `.pdo-layout`: column flex, gap 0.55rem; fieldsets with small legends.
- Available list: font 0.78rem, cells `0.14rem 0.35rem`, sticky header. The `steps` column (4.2rem)
  exists only while "Bitwise mapping" is checked, so column widths stay constant; `-`/`+` buttons
  are 1.3rem × 1.15rem. Row hover `#f0ece3`; `tbody.locked` (no PDO element picked) has no hover and
  the default cursor.
- Communication parameters: `.comm-grid` = fields (`.info-line` with `7.4rem` labels) | a column of
  `button.system`: **Add new PDO**, **Delete PDO**, **Apply** (tomato when dirty), and the checkbox
  **Auto Apply** below Apply. "Invalid" is placed under COB, "Bitwise mapping" under Sync start
  (both as checkbox rows with an empty label cell).
- PDO grid: each row is a CSS grid `2.5rem 5.6rem 3.8rem var(--byte-span)`; `--byte-span =
  (100cqi − 11.9rem − 2px) × var(--zoom)` (container query units on `.map-scroll`). The first three
  columns are sticky (left 0, 2.5rem, 8.1rem) and show the default cursor. The bit track is
  `grid-template-columns: repeat(64, minmax(0, 1fr))`, so every cell spans exactly its bit count.
  - Header row 1: `ID`, `COB`, `Index`, then 64 `<i>` bit numbers (0.62rem; every 8th starting at 0
    tomato and bold; byte boundaries with darker borders).
  - Header row 2: three empty cells, then 8 `<b>Byte N</b>` cells spanning 8 bits, background tomato
    and `#b8341c` for odd bytes, white bold text.
  - PDO rows: ID = slot number + 1, COB = full 32-bit COB-ID `0xXXXXXXXX` without `$NODEID`, Index =
    `0xIIII` (communication index). ID/COB/Index backgrounds `lightblue`, even rows `lightcyan`.
    Mapped objects alternate `khaki` / `lemonchiffon` (`.a` / `.b`), font 0.72rem, line-height 2
    (rows are ≈ 20 % higher than the first version), text ellipsis, title = label. Free bits are one
    `Empty` cell without box (`#666`). A picked cell: `#0a64c8`, white.
  - Selected PDO row: ID/COB/Index `#1d3f73` with white bold text, bit track `#dfe9f7`, and an
    `::after` frame `3px solid #1d3f73` with `box-shadow: 0 0 0 1px white, 0 2px 6px rgb(0 0 0 / 35%)`.
- Below: **Zoom In** and **Zoom Out** (`button.system`).

### 11.2 PDO list (`pdoSlots`)

- All communication objects in the range that are **not disabled**, sorted. `slot = index − base`.
- COB (sub 1), Type (sub 2), Inhibit (sub 3), Event Timer (sub 5), Sync start (sub 6).
- Mapping rows: sub-objects 1..count of the mapping object (count = sub 0, or the number of subs if
  sub 0 is empty). Mapping values are `0xIIIISSBB` (index, sub-index, bits), decimal or hex.
- Cells (`slotBlocks`): one cell per row with bits > 0, label `0xIIII/SS/<name>` (dummy name, object
  name for sub 0 of a VAR, otherwise the sub name or the object name), then one `Empty` cell for the
  remaining bits up to 64.
- The selected PDO defaults to the first one.

### 11.3 Available Objects for PDO (`mappableEntries`)

- Always first the dummy objects (always selectable):

  | Name | Index | Sub | Datatype |
  |------|-------|-----|----------|
  | Dummy Bool | 0x0001 | 0x00 | BOOLEAN |
  | Dummy Int8 | 0x0002 | 0x00 | INTEGER8 |
  | Dummy Int16 | 0x0003 | 0x00 | INTEGER16 |
  | Dummy Int32 | 0x0004 | 0x00 | INTEGER32 |
  | Dummy UInt8 | 0x0005 | 0x00 | UNSIGNED8 |
  | Dummy UInt16 | 0x0006 | 0x00 | UNSIGNED16 |
  | Dummy UInt32 | 0x0007 | 0x00 | UNSIGNED32 |

- Then all enabled VAR objects and sub-objects whose `pdoMapping` fits the direction: TX accepts
  `TPDO`, `optional`, `default`; RX accepts `RPDO`, `optional`, `default`.
- Bits: datatype width; VISIBLE_STRING = length of the default value × 8; OCTET_STRING = number of
  hex bytes × 8. Shown bits: without bitwise mapping `byteMappingBits(bits)` = rounded up to whole
  bytes, at least 8, at most 64; with bitwise mapping the width of the picked cell if the row is
  its object, otherwise the datatype width (DOMAIN: 8).

### 11.4 Interaction

- Clicking a PDO row selects the PDO (guard if another PDO has unapplied edits). Selecting a
  different PDO clears a picked cell in another PDO.
- Clicking a cell selects its PDO and **picks** the cell. If the cell maps an object, that object is
  selected in the list and the list is scrolled so the row is roughly in the middle.
- Without a picked cell, the list is locked. Clicking a list row with a picked cell assigns the
  object: width = datatype width (bitwise) or whole bytes (not bitwise), capped by the free bits;
  if nothing fits → warning `The object does not fit into the PDO.`. Picking the `Empty` cell
  appends a new mapping entry (`addMapping`: next sub-index, name `Mapping N`, sub 0 = count; at most
  64 entries).
- With "Bitwise mapping", the selected list row shows `-` and `+` (not for objects whose width is
  1 bit, e.g. BOOLEAN) to change the width of the picked cell between 1 and min(datatype width,
  free bits); the grid updates immediately.
- Right-click on a mapped cell (picks it first) opens the menu **Insert Item before**, **Insert Item
  after**, **Remove Item**:
  - Insert adds a **Dummy Bool** (0x0001) with 1 bit (bitwise) or 8 bits (not bitwise) before/after
    the entry; following entries move up by one; the inserted cell is picked and Dummy Bool is
    selected in the list. Not enough space → `The object does not fit into the PDO.`.
  - Remove deletes the entry; following entries move down; sub 0 = new count.
- **Zoom In/Out** multiplies the zoom by 1.25 / 0.8 (limits 0.35 … 6); only the bit area scales
  horizontally; the horizontal scroll position is kept.

### 11.5 Communication parameters

- **Communication** / **Mapping** index: hex input; on change it must lie in the communication
  range (`The communication index must be between 0x1800 and 0x19FF.`) or mapping range
  (`The mapping index must be between …`); invalid hex → `Enter the index as a hexadecimal number.`.
  Moving changes both objects (mapping = communication + 0x200); a used target →
  `Index 0xIIII or 0xIIII is already in use.`. The field is reset on errors.
- **COB**: on change normalized (`$NODEID+0x…` or `0x…+$NODEID` keeps its position and digit count)
  and checked (warning, value kept): no plain number → `COB "<raw>" is no valid COB-ID. Use a number,
  optionally with $NODEID+ before or +$NODEID after it.`; reserved bits set → RPDO `COB-ID used by
  RPDO: bits 11-30 must be 0 (bit 31: PDO not valid, bits 0-10: 11-bit CAN-ID).`, TPDO `COB-ID used
  by TPDO: bits 11-29 must be 0 (bit 31: PDO not valid, bit 30: no RTR allowed, bits 0-10: 11-bit
  CAN-ID).`.
- **Invalid**: checked if bit 31 is set; toggling sets/clears only bit 31 (`setCobBits`), keeping
  CAN-ID, other bits, `$NODEID`, and the digit count. A COB that is no plain number is not changed;
  the COB warning is shown instead.
- **Type**: warning if not 0..255 (`Transmission type must be a number from 0 to 255.`) or 241..253
  (`Transmission type <v> is not used (allowed: 0-240 synchronous, 254/255 event-driven).`).
- **Inhibit** (TX only): 0..65535 (`Inhibit time (multiple of 100 µs) must be a number from 0 to
  65535.`). **Event Timer** (both): 0..65535 (`Event timer (ms) must be a number from 0 to 65535.`).
  **Sync start** (TX only): 0..240 (`SYNC start value must be a number from 0 to 240.`). Warnings
  appear when the field is left; the value is kept. Missing sub 5 (Event timer) / sub 6 (SYNC start
  value) are created on the first edit and sub 0 is updated.
- **Bitwise mapping**: editor flag per PDO. If no flag was set, a PDO counts as bitwise when any
  mapped width is not a multiple of 8. Unchecking rounds every width up to whole bytes (error
  `The objects do not fit into the PDO without bitwise mapping.` if > 64 bits, checkbox reverts);
  checking shrinks widths that exceed the datatype width.
- **Add new PDO** (guard first) creates, at the first free slot, objects like `DS301_profile.xpd`:
  - RPDO: `RPDO communication parameter` (RECORD) with 0x00 `Highest sub-index supported`
    (UNSIGNED8, const, `0x05`), 0x01 `COB-ID used by RPDO` (UNSIGNED32), 0x02 `Transmission type`
    (UNSIGNED8, `255`), 0x05 `Event timer` (UNSIGNED16, `0`).
  - TPDO: `TPDO communication parameter` with 0x00 (`0x06`), 0x01 `COB-ID used by TPDO`, 0x02
    `Transmission type` (`255`), 0x03 `Inhibit time` (`0`), 0x05 `Event timer` (`0`), 0x06
    `SYNC start value` (`0`).
  - Mapping object `RPDO/TPDO mapping parameter` with 0x00 `Number of mapped application objects in
    PDO` (`0`).
  - COB-ID: slots 0..3 `$NODEID+0x200…0x500` (RX) / `$NODEID+0x40000180…0x40000480` (TX, no RTR);
    later slots `0x80000000` (invalid). A disabled communication object still occupies its slot.
  - The new PDO is selected; this is applied directly (no draft). Errors: `No further PDO slot is
    free.`, `Mapping index IIII is already in use.`.
- **Delete PDO**: `confirm('Delete PDO?')`, discards the draft, removes both objects.

### 11.6 Draft, Apply, Auto Apply

- The first edit of a PDO creates a `PdoDraft`: a shallow copy of the document whose communication
  and mapping objects are deep clones. All edits (fields, indices, bitwise flag, assignments,
  widths, insert/remove) go to the draft; the PDO tab shows the draft, the OD tab still shows the
  applied state. `syncPdoDraft` takes over other objects changed in the document meanwhile.
- `dirty` = state of the draft PDO (comm, map, bitwise flag, index) differs from the document.
  Registered in `UnsavedEditsService` as owner `pdo-tx`/`pdo-rx` with label
  `PDO 0xIIII in "TX PDO Mapping"` and indices of the original and the moved objects.
- **Apply**: overwrite confirmation for unapplied OD edits on the same objects
  (`<label> has unapplied changes. Overwrite them?`); granularity check of the draft mapping object
  (`choose(…, ['Apply'], 'Warning')` with footer `Apply anyway?`); `commitPdoDraft` (error
  `Index 0xIIII is already in use.` if a moved target was taken meanwhile); then `changed`.
- **Guard** on selecting another PDO or "Add new PDO": Auto Apply → Apply; otherwise the movable
  window "Unapplied Changes": `You have unapplied changes for PDO 0x1800.` / `Do you want to apply
  them and switch to a different PDO?` with **Apply**, **Discard**, spacer, **Cancel**. Discard drops
  the draft (including a moved index).
- View state per device and direction: `{ slot, zoom }`; the selected row is scrolled into view.

### 11.7 PDO counts

`nrOfRxPdo`/`nrOfTxPdo` = number of enabled communication objects; recalculated on open/create and
in every `touch` (e.g. after Toggle in the OD tab).

### 11.8 Names of mapping entries

- Generated name: `<mapping sub-index as decimal> - 0xIIII/SS/<name>`, e.g.
  `2 - 0x0005/00/Dummy UInt8`. The bit width is not part of the name; the leading number keeps it
  unique when a PDO maps the same object twice.
- Written only when the mapped object of an entry changes: assignment in the PDO tab, Insert Item,
  or a new default value in the OD tab that maps another object. Changing only the width keeps the
  name. Edited names stay until the mapped object changes.
- Insert/Remove Item: entries that move keep an edited name; a generated name follows the new
  mapping index. Names of existing projects (e.g. "Application object 1") stay until the object
  changes.

---

## 12. Checks

### 12.1 Granularity (`mappingGranularityIssues`, `pdoGranularityIssues`)

- G = `document.granularity`. Units are checked only for whole G > 1.
- Walk the counted entries in sub-index order with a running bit offset `start`:
  - A dummy object (0x0001..0x0007) whose end `start + bits` is a multiple of G fills up and always
    fits.
  - Otherwise an object fits if it lies within one unit
    (`floor(start / G) === floor((end − 1) / G)`) or starts and ends on unit boundaries.
  - Not fitting → `<TPDO|RPDO> 0xCCCC entry <n>: 0xIIII/SS <name> (<bits> bits, bit <a>-<b>)`
    (0xCCCC = communication index).
- Independently of G: if the total length is not a multiple of 8 →
  `<kind> 0xCCCC: byte <k> is not filled up (<r> of 8 bits used)`.
- Message (`granularityMessage`): text `The PDO mapping does not fit the granularity of <G> bits (an
  object must lie within one <G>-bit unit or start and end on unit boundaries) or leaves a byte not
  filled up (fill it e.g. with a dummy object):`, the issues as items, and a footer.
- Triggered: after a changed granularity (all enabled PDOs, only OK), on Apply in a PDO tab, and on
  Apply of a mapping sub-object in the OD tab ("Apply anyway?" with **Apply** / **Cancel**).

### 12.2 Mapping consistency in the OD tab (`checkMappingObject`)

Before applying a sub-object of a mapping object (errors are warnings, nothing is applied):

- count (sub 0) 0..64 → `The number of mapped objects must be between 0 and 64.`
- every counted entry exists → `Mapping entry <n> does not exist, but <c> objects are mapped.`
- valid mapping value (entries with `$` are skipped) → `Mapping entry <n>: "<raw>" is not a valid
  mapping value.`
- target exists (or is a dummy) → `Mapping entry <n>: object 0xIIII/SS does not exist.`
- width ≤ datatype width; unless the PDO is explicitly bitwise, a whole-byte width may use the
  datatype width rounded up to bytes (BOOLEAN with 8 bits is valid) → `Mapping entry <n>: <b> bits
  exceed the width of 0xIIII/SS (<max> bits).`
- explicitly not bitwise → whole bytes → `Mapping entry <n>: <b> bits are not whole bytes, but
  "Bitwise mapping" is off for this PDO.`
- total ≤ 64 → `The mapped objects need <t> bits, but a PDO holds at most 64 bits.`

---

## 13. Dialog "Insert Profile" (`insert-profile.component.ts`, `xdd/profiles.ts`)

```text
┌ Insert Profile ─────────────────────────────────────────────────── (52rem wide, not movable) ┐
│ ┌ Profiles ──────────────┐                                                                    │
│ │ □ DS301_profile.xpd     │                                                                    │
│ │ □ DS301_profile_old.xpd │                                                                    │
│ │ □ DS401_profile.xpd     │                                                                    │
│ │ □ DSP302-NMTMaster.xpd  │                                                                    │
│ └─────────────────────────┘                                                                    │
│ Target  [ open device ▾ ]                                                                     │
│ Index Offset (single or space separated list for multiple insert)  [0]                        │
│ (red) Syntax error in Index Offset.                                                           │
│ ┌ Insert │ Original Object                         │ Index ┐  (scrolls, sticky header)        │
│ │  ☑     │ 0x1000 - Device type  DS301_profile.xpd │ 0x1000│  conflicting + checked → tomato  │
│ └────────────────────────────────────────────────────────────┘                                 │
│ [Insert] [Check all] [Uncheck all]  ·························  [Cancel]                       │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Clicking the backdrop closes it. Profiles are fetched from `profiles/<file>` on first check and
  cached (error window on failure).
- Offsets: space separated, decimal, `0x` hex, negative, or ranges `a-b` (at most 64 values).
- Rows: every object of every checked profile; `indexes` = index + each offset. A row is in conflict
  if a new index is invalid or already used in the target (or by an earlier selected row). A
  conflicting row starts **unchecked**; when checked again it is highlighted (tomato, bold).
- **Insert**: for checked conflicts `confirm('<idx> <name> already exists. Overwrite the existing
  object?')` (or the plural form). OK overwrites; Cancel inserts only the non-conflicting rows, or
  warns `Existing objects were kept.` if none are left. After insertion the dialog closes and the OD
  tab is shown.

---

## 14. Dialog "Insert OD Objects" (Clone…) (`clone-objects.component.ts`, `xdd/clone.ts`)

Layout as in `images/Template_Tab_Object_Dictionary_Clone_Object.png`:

```text
┌ Insert OD Objects ─────────────────────────────────────────┐
│ Target [ open device ▾ ]                                    │
│ Index Offset (single or space separated list for multiple insert) [1] │
│ ┌ Insert │ Original Object      │ Offset 1 │ Offset 2 … ┐    │
│ │  ☑     │ 0x2011 - CAN State   │ 0x2012   │            │    │
│ │        │ 0x2130 - Kbm State   │ 0x2131 (tomato)       │    │  conflict: no checkbox, row grey
│ └──────────────────────────────────────────────────────┘    │
│ [Insert] [Uncheck all]  ·························  [Cancel] │
└─────────────────────────────────────────────────────────────┘
```

- One column per offset. A cell conflicts if the new index is invalid (≤ 0 or > 0xFFFF), already
  used in the target, or claimed by an earlier row; a conflicting row has no checkbox, its other
  cells are grey (`#8a857c`), the conflicting index is tomato and bold. Such objects are never
  cloned and nothing is overwritten.
- Clone names: a trailing number is shifted by the offset (`Rpdo 1` + 2 → `Rpdo 3`), unless the
  result would be negative.
- **Insert** copies the checked rows into the target device (deep copy, sub-object indices
  updated) and closes the dialog.

---

## 15. Example project and profiles

- `public/demo_io.xdd` ("Demo-IO", English names): 0x1000 Device type, 0x1001 Error register,
  0x1008/0x1009/0x100A manufacturer names/versions, 0x1014 COB-ID EMCY, 0x1015 Inhibit time EMCY,
  0x1017 Producer heartbeat time, 0x1018 Identity, 0x1200 SDO server parameter, 0x1400/0x1600 RPDO 1,
  0x1800/0x1801 + 0x1A00/0x1A01 TPDO 1–2, 0x2000 Digital outputs, 0x2001 Analog inputs, 0x2002
  Digital outputs mask, 0x2003 Digital inputs (BOOLEAN subs "Input D1"…), 0x2100 Temperature
  (REAL32), 0x2101 Setpoint, 0x2102 Device name, 0x2103 Filter time ms. Granularity 8, 1 RPDO,
  2 TPDOs, boot-up slave.
- `public/profiles/*.xpd` are verbatim copies of `EDSEditorGUI/Profiles` and are parsed with the
  same XDD parser. `DS301_profile.xpd` contains 4 RPDOs and 4 TPDOs plus disabled 0x1404/0x1804.

---

## 16. Performance rules

- All four panes stay rendered; inactive ones are `[hidden]` (`display: none`).
- Templates must not compute from the whole document. In `PdoViewComponent`, `view` (slots and
  cells per slot) and `mappableList` are `computed()` on `revision` and a local `edits` counter;
  the OD view filters its three lists from `document.objects` only.
- Every document change goes through `store.touch()` (`revision + 1`). Target: < 100 ms per click
  for 50 RPDOs with 10–20 mapped objects each.

---

## 17. Tests (Vitest, 63 tests)

| File | Covers |
|------|--------|
| `model/device.spec.ts` | `nextFreeIndex` (hovered object, last object, empty range, wrap-around), `dataTypeChoices` |
| `state/dialog.service.spec.ts` | confirm OK/Cancel, choose returns the button or null, queue order |
| `xdd/xdd-codec.spec.ts` | reading XDD 1.1 and 1.0, rejecting EDS/non-XDD, round trip, new device output |
| `xdd/profiles.spec.ts` | offsets (single, hex, range), DS301 insert, index reuse between profiles, overwrite |
| `xdd/heartbeat.spec.ts` | used 0x1016 entries, count limit, raising "No of monitored nodes" |
| `xdd/clone.spec.ts` | blocked indices, negative offsets, no overwrite, shifted names |
| `xdd/pdo.spec.ts` | mapping names, `fitMappingBits`, `bitLength`, `mappableEntries`, bitwise widths, moving PDOs, insert entries, adding the event timer, drafts, `checkMappingObject` (incl. BOOLEAN 8 bits), COB-ID parsing/Invalid/reserved bits, field ranges, `addPdo`, disabled PDOs, granularity and byte fill, counted entries |

`npm test` must pass and `npx ng build` must succeed after every change.

---

## 18. Working rules (from `AGENTS.md` and the conversation)

- Replies to the user are in German; UI labels stay English; XDD only.
- Do not commit or push before the user has tested the change in the browser: keep
  `ng serve --host 0.0.0.0 --port 4200` running, leave the changes uncommitted, and commit, push,
  and update the pull request only after explicit confirmation. Rebase onto `origin/webapp` before
  pushing.
- Update `AGENTS.md` whenever behavior changes.

---

## 19. Decision history (from the conversation, in order)

The current behavior is the result of these requests; later items override earlier ones.

1. Angular web app on branch `webapp`, based on the desktop editor; only XDD is read and written.
2. Layout of all tabs prescribed by the template screenshots; "Access SDO" only `no/ro/wo/rw`.
3. PDO grid: zoom only the byte area; objects and bit/byte headers exactly on bit boundaries; odd
   byte headers in another color. Per-cell pull-downs were added and removed again: objects are
   assigned via "Available Objects for PDO" (pick a cell, then a list row; a mapped cell selects
   and centers its list row).
4. Mapping entries in the OD are named after the mapped object; first `Index/Subindex/Name (bits)`
   with a refresh button, then without the button, finally `Mapping-Index - Index/Subindex/Name`
   with a decimal mapping index, written only when the mapped object changes; edits are kept.
5. Selected PDO framed and later more strongly highlighted; dummy objects at the top of the list
   (later "Dummy Bool" 0x0001 added).
6. Communication parameters: hex COB/Index, editable indices, "Invalid" under COB, "Bitwise mapping"
   under Sync start with byte rounding / `-` `+` column, Event Timer editable for RX, no `-` `+` for
   BOOLEAN; TX tab before RX; context menu Insert Item before/after and Remove Item.
7. OD context menu "Clone..." with target project, offsets, and blocked conflicts.
8. Start page with New / Open / Open example XDD; in-app dialogs instead of `confirm()`; no notice
   line; unsaved projects highlighted in "Devices".
9. Performance fix for 50 RPDOs (revision-based computed data).
10. "Reset Name" next to the Name field (only for active entries), later "Reset all" in the sub
    table header with a warning and immediate application.
11. Explicit saving of PDO edits (draft), cross-tab overwrite warnings, mapping consistency checks.
12. "Add..." proposes the next free index from the mouse position.
13. Normal mouse pointer over ID/COB/Index; device tab and selections remembered per project.
14. Device Info ranges (Granularity 1..64, No of monitored nodes 0..127) with correction offers.
15. "New" asks for empty project or DS301 profile (choices left, Cancel right); example project
    `demo_io.xdd` with English names.
16. Granularity check (units, dummy fill-up, byte fill-up, one line per warning, scrolling after 8
    lines); 0x1016-based "No of monitored nodes" with "Refresh"; PDO rows 20 % higher.
17. COB column: COB-ID without `$NODEID`, then the full 32-bit value; DS301 PDO count fixed
    (disabled objects are no PDOs); COB bits follow the DS301 comments (Invalid = bit 31 only).
18. Movable dialogs with grab cursor; "Close without saving"; restricted data types.
19. "Unsaved changes" became "Unapplied Changes" with Apply / Discard left and Cancel right;
    granularity warning with Apply; OK on the left everywhere; save dialog cancellation detected.
20. "Save Changes"/"Autosave changes" renamed to "Apply"/"Auto Apply"; OD layout: Auto Apply
    left-aligned above Apply on the "Default value" line.
21. BOOLEAN with 8 bits accepted in OD mapping entries without bitwise mapping; "Discard Changes"
    renamed to "Discard".
