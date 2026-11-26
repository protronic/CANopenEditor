# Display texts (meta texts)

Display texts are additional, translatable texts for the entries of an object
dictionary: short labels for touch displays, tooltips and descriptions for web
pages, units, texts for single values, and a multiplier from the raw value to
the displayed value. They are stored as optional custom properties in the
existing project format (XDD 1.1, CANopenNode protobuf / JSON) and exported
into firmware as a compact C dictionary (`meta.c` / `meta.h`).

Files without display texts are read and written exactly as before.

## Concepts

| Term | Meaning |
|---|---|
| Meta entry | The texts of one address: a VAR (`index`, sub-index 0), an ARRAY or RECORD object itself (`index`), or one of its sub entries (`index:sub`). |
| Text kind | What a text is used for, e.g. `label` or `tooltip`. |
| Meta project | A project file (usually a copy of the object dictionary, e.g. `device_meta.xdd`) that holds the texts for another object dictionary. Texts may also be stored directly in the object dictionary. |
| Meta address | Optional reference from an object dictionary entry to the meta entry whose texts apply, so that several entries share one text (e.g. all RPDO communication parameters). |

## Text kinds

| Kind | Use | Typical length | In `meta.c` |
|---|---|---|---|
| `label` | Name on touch displays and web pages | 16 | always |
| `tooltip` | Short help text | 128 | only where listed in `CO_textExport` |
| `description` | Long help text for web pages | unlimited | only where listed in `CO_textExport` |
| `unit` | Unit of the displayed value, e.g. `°C` | 8 | always |
| `value.<n>` | Text of the value `<n>`, e.g. `value.0` = "Off" | 16 | always |

`<n>` is a decimal (optionally negative) or `0x` hexadecimal integer that fits
into 32 bit. Further text kinds may be used; they are exported into firmware
only where listed in `CO_textExport`. Single bits have their own addresses in
the object dictionary and get labels there; there is no text kind for bits.

## Storage

Each text is identified by a key `<kind>:<language>`, e.g. `label:de`. The
language is a code such as `de`, `en` or `pt-BR`.

### XDD 1.1

Texts are custom properties of the `parameter` element of the object or sub
entry, like `CO_countLabel` or `CO_storageGroup`. For a VAR the properties are
on its single parameter.

| Property | Value |
|---|---|
| `CO_text:<kind>:<language>` | The text, e.g. `name="CO_text:label:de" value="Kesseltemp."` |
| `CO_metaRef` | Meta address, e.g. `0x1400` or `0x1400:01` (hexadecimal) |
| `CO_textExport` | Comma separated text kinds exported into firmware in addition, e.g. `tooltip` |
| `CO_multiplier` | Multiplier from the raw value to the displayed value, e.g. `0.1` (invariant culture) |

```xml
<parameter uniqueID="UID_OBJ_2100" access="read">
  <label lang="en">Boiler temperature</label>
  <INT />
  <property name="CO_text:label:de" value="Kesseltemp." />
  <property name="CO_text:label:en" value="Boiler temp." />
  <property name="CO_text:tooltip:de" value="Aktuelle Temperatur im Kessel" />
  <property name="CO_text:unit:de" value="°C" />
  <property name="CO_textExport" value="tooltip" />
  <property name="CO_multiplier" value="0.1" />
</parameter>
```

Project wide settings are characteristics in `DeviceFunction/capabilities`
(next to "SW library"); the characteristic name is the label of
`characteristicName`, each value one `characteristicContent` label:

| Characteristic | Contents |
|---|---|
| `CO_textLanguages` | One content per language, in display order, e.g. `de`, `en` |
| `CO_textFallbackLanguage` | Language used where a text is missing, e.g. `de` |
| `CO_textMaxLength` | One content `<kind>=<length>` per text kind, e.g. `label=16` (used for warnings) |
| `CO_metaProject` | `true` if the file is a meta project |
| `CO_metaSource` | File name of the object dictionary of a meta project, relative to the meta project |

The technical name (`label` element) and description of an entry are not
changed; C identifiers are derived from the name, so it is not translated.

### Protobuf / JSON

`OdObject` and `OdSubObject` have the additive, optional field `meta`
(field 300, message `OdMetaTexts`: `texts` map with key `<kind>:<language>`,
`metaRef`, `textExport`, `multiplier`); `CanOpenDevice` has `textInfo`
(field 300, message `CanOpen_TextInfo`). The texts of a VAR are on its
`OdObject`. Both fields are written only where texts exist, so JSON files
without texts are unchanged and readable by older programs. The existing JSON
export ("CanOpenNode Protobuf (json)") contains all texts, for example for web
pages:

```json
"2100": {
  "name": "Boiler temperature",
  "objectType": "OBJECT_TYPE_VAR",
  "subObjects": { "00": { "dataType": "INTEGER16" } },
  "meta": {
    "texts": { "label:de": "Kesseltemp.", "label:en": "Boiler temp.", "unit:de": "°C" },
    "metaRef": "",
    "textExport": [ "tooltip" ],
    "multiplier": "0.1"
  }
}
```

### EDS

EDS has no languages. The texts are not written to EDS or DCF files.

## Meta address resolution

For an entry of the object dictionary the meta entry is found as follows:

1. A sub entry with its own `CO_metaRef` uses that address; without a
   sub-index in the reference, its own sub-index.
2. Otherwise, if its object has a `CO_metaRef`, the referenced index with the
   own sub-index (for the object itself or a VAR: the referenced address).
3. Otherwise its own address.

Example: object 0x1401 with `CO_metaRef = 0x1400` uses the texts of 0x1400:01,
0x1400:02, … for its sub entries 1, 2, …

A reference to a VAR without sub-index means the VAR.

## C export: `meta.c` / `meta.h`

Exporter "CanOpenNode Meta" in libEDSsharp:

```bash
# a meta project: meta.c/meta.h (instead of OD.c/OD.h) and the JSON export
EDSSharp --export-project --infile device_meta.xdd --outdir ./out [--odfile device.xdd] [--langs de,en] [--glyphs glyphs.txt]

# explicitly
EDSSharp --infile device_meta.xdd --outfile out/meta.c --type CanOpenNodeMeta [--odfile device.xdd] [--odname PREFIX]
```

- The object dictionary for the meta addresses is `--odfile`, otherwise the
  file in `CO_metaSource`, otherwise the meta project itself.
- `--export-project` on an object dictionary that contains texts writes
  `meta.c` / `meta.h` in addition to `OD.c` / `OD.h`.
- `--langs` exports only some languages, `--glyphs` writes all characters of
  the exported texts into a file (for `lv_font_conv --symbols`; add digits and
  signs for numbers yourself).
- Warnings: texts longer than the maximum length, unknown meta addresses.

The generated code is plain C99 without dependencies and all data is `const`
(flash); the only variable is the selected language.

| Part | Layout |
|---|---|
| Meta entry | `meta_id_t` (uint16), numbered in address order; constants `META_H2100`, `META_H2110`, `META_H2110_01` |
| String pool per language | All texts of the language, UTF-8, NUL terminated, each text only once |
| Text table per kind and language | 16-bit offsets into the pool (32 bit if a pool exceeds 64 KiB), dense (indexed by meta entry) or sparse (sorted meta entries), whichever is smaller; a language without texts of a kind has no table |
| Object dictionary mapping | Sorted keys `index << 16 \| sub` (0x100: the object itself) and meta entries, binary search |
| Value texts | Lists of sorted values with offsets per language; equal lists are stored once |
| Multipliers | Sparse list with `float` multiplier and decimal places (from the written multiplier, `0.10` → 2) |

```c
meta_id_t   meta_find(uint16_t index, uint8_t subIndex);   /* VAR or sub entry */
meta_id_t   meta_find_object(uint16_t index);              /* ARRAY / RECORD itself */
const char *meta_text(meta_id_t id, meta_text_t text);     /* selected language, fallback; NULL if none */
const char *meta_text_lang(meta_id_t id, meta_text_t text, meta_lang_t lang);
const char *meta_value_text(meta_id_t id, int32_t value);
uint16_t    meta_value_count(meta_id_t id);
const char *meta_value_at(meta_id_t id, uint16_t n, int32_t *value);
float       meta_multiplier(meta_id_t id);                 /* 1.0f if none */
uint8_t     meta_decimals(meta_id_t id);
void        meta_set_language(meta_lang_t lang);
meta_lang_t meta_get_language(void);
const char *meta_language_code(meta_lang_t lang);
```

The prefix `meta` is the name of the output file or `--odname`.

### LVGL

Texts are constant, so `lv_label_set_text_static()` can be used without
copying:

```c
lv_label_set_text_static(label, meta_text(META_H2100, META_TEXT_LABEL));
```

[`demo/meta/meta_lvgl.c`](../demo/meta/meta_lvgl.c) is an example for LVGL 9:
labels and drop-down lists that follow language changes, and formatting of
raw values with multiplier, decimal places, unit and value texts.
