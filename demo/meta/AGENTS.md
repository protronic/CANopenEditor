# AGENTS.md: display texts (`meta.c` / `meta.h`) in the LVGL firmware

Instructions for coding agents (and people) who write firmware user interface
code with LVGL 9. All texts that belong to object dictionary entries (labels,
units, value texts such as Off / On, help texts) and the scaling of displayed
values come from generated files. This file says how to use them and what not
to do.

To use it, copy this file together with `meta_lvgl.c` and `meta_lvgl.h` into
the firmware folder that holds the generated `meta.c` / `meta.h`, or append it
to the `AGENTS.md` in the root of the firmware repository. Adapt the paths in
"Regenerating" once.

## Files

| File | Origin | Edit? |
|---|---|---|
| `<device>.xdd` | Object dictionary, edited in the CANopen Editor | only in the editor |
| `<device>.xui` | User interface file: the texts, edited in the tab *User Interface* of the editor | only in the editor |
| `meta.c`, `meta.h` | Generated from the `.xui` by EDSSharp: all texts as constant tables | **never** |
| `meta_glyphs.txt` | Generated: every character used in the exported texts, for the font converter | never |
| `meta.json` | Generated: all texts including descriptions, for web pages; not used in firmware | never |
| `meta_lvgl.c`, `meta_lvgl.h` | Helper for LVGL 9, maintained by hand in the firmware | yes |

`meta.c` is plain C99, needs only `<stdint.h>` and no heap; all data is `const`
(flash). Its only variable is the selected language.

## Rules

1. **No text for an object dictionary entry as a string literal.** Labels,
   units, value texts and help texts come from `meta_text()`,
   `meta_value_text()` or the helper functions. The same holds for scale
   factors and decimal places: use `meta_multiplier()` / `meta_decimals()` or
   `meta_lvgl_format()`, never a hard-coded `/ 10` or `"%d.%d °C"`.
2. **Never edit `meta.c`, `meta.h`, `meta_glyphs.txt` or `meta.json`.** A
   wrong, missing or too long text is fixed in the `.xui` (editor), then the
   files are regenerated. If you cannot do that, say which entry, language and
   text kind is affected and leave the firmware code as it is. Do not work
   around it with a literal.
3. **Every text can be missing.** `meta_text()`, `meta_value_text()` and
   `meta_value_at()` return `NULL`, `meta_find()` and `meta_find_object()`
   return `META_ID_NONE`. All `meta_*` functions accept `META_ID_NONE` and
   unknown numbers (they return `NULL`, 0 or 1.0f), so check the text, not the
   number. The helper shows a missing text as empty label.
4. **Pick the entry the right way.**
   - A fixed screen for a known entry uses the constant: `META_H2100` (VAR or
     the ARRAY/RECORD itself), `META_H2001_02` (sub entry). If the entry is
     removed from the user interface, the build fails. That is intended:
     adapt the screen or restore the entry, do not define the constant
     yourself.
   - Code that gets an object dictionary address at run time uses
     `meta_find(index, subIndex)`, or `meta_find_object(index)` for the title
     of an ARRAY/RECORD. Only these follow the *UI address* of an entry: when
     0x1401 uses the texts of 0x1400, there is no `META_H1401`, but
     `meta_find(0x1401, 1)` returns the entry of 0x1400:01.
   - Never compute a `meta_id_t` or store one in non-volatile memory; the
     numbers change with every regeneration.
5. **Texts are constant UTF-8 strings that stay valid.** Do not free, modify
   or cut them by bytes. They differ per language, so a pointer obtained
   before a language change shows the old language: bind widgets with the
   helper or fetch the text again.
6. **Change the language only with `meta_lvgl_set_language()`**, not with
   `meta_set_language()`. It updates all labels and drop-down lists bound
   with the helper on all screens. Texts you formatted yourself (values with
   unit, value texts in tables) are not bound: update them right after the
   call.
7. **A drop-down list position is not the value.** Fill lists of value texts
   with `meta_lvgl_dropdown()` and read the value with
   `meta_lvgl_dropdown_value()`; values may be 0, 1, 5 or -1.
8. **Call LVGL and `meta_lvgl_*` only from the LVGL task** (or while holding
   the LVGL lock), like every LVGL function. `meta_text()` and the other
   reading functions may be called from any task.
9. **Not everything is in the firmware.**
   - `label`, `unit` and value texts: every entry that has them.
   - `tooltip`: only entries with *also in firmware* ticked in the editor.
   - `description`: never; it is in `meta.json` for web pages.
   - Entries with *On display* unticked: not at all. They have no constant and
     `meta_find()` returns `META_ID_NONE`. If the display needs such an
     entry, it has to be switched on in the editor.

## API

| Call | Result |
|---|---|
| `META_H2100`, `META_H2001`, `META_H2001_02` | Entry of a VAR, an ARRAY/RECORD itself, a sub entry (`meta_id_t`) |
| `meta_find(index, subIndex)` | Entry for an object dictionary address (VAR: sub-index 0), or `META_ID_NONE` |
| `meta_find_object(index)` | Entry of an ARRAY/RECORD itself, or `META_ID_NONE` |
| `meta_text(id, META_TEXT_LABEL)` | Text in the selected language, else in the fallback language, else `NULL`; kinds `META_TEXT_LABEL`, `META_TEXT_UNIT`, `META_TEXT_TOOLTIP` |
| `meta_text_lang(id, kind, lang)` | Text in one language without fallback, or `NULL` |
| `meta_value_text(id, value)` | Text of a value, e.g. 1 gives "On", or `NULL` |
| `meta_value_count(id)`, `meta_value_at(id, n, &value)` | Values that have a text, sorted by value; for lists |
| `meta_multiplier(id)`, `meta_decimals(id)` | Displayed value = raw value × multiplier; decimal places of the multiplier (`0.1` gives 1). 1.0f and 0 if none is set |
| `meta_set_language(lang)`, `meta_get_language()` | `META_LANG_DE`, `META_LANG_EN`, … ; `META_LANG_COUNT`, `META_LANG_FALLBACK` |
| `meta_language_code(lang)` | "de", "en", … or `NULL` |
| `meta_lvgl_label(label, id, kind)` | Label that shows a text and follows the language |
| `meta_lvgl_dropdown(dd, id, value)` | Drop-down list of the value texts, `value` selected; returns the number of options |
| `meta_lvgl_dropdown_value(dd, id, &value)` | Value of the selected option |
| `meta_lvgl_format(id, raw, buf, size)` | Raw value as text: the value text if there is one, else number with multiplier, decimal places and unit ("21.5 °C") |
| `meta_lvgl_set_language(lang)` | Selects the language and updates all bound widgets |

`meta_lvgl_format()` works without floating point `printf`, but calculates in
`float`: raw values beyond about ±16 million lose digits.

## Recipes

The functions below compile as they are (C99, LVGL 9.2). Raw values are passed
in by the caller; read them from the object dictionary the way the firmware
does it elsewhere (e.g. `OD_RAM.x2101_setpoint`).

A row "label … value with unit":

```c
#include "meta_lvgl.h"

/* A row with the label of an entry on the left and room for its value on the right. */
lv_obj_t *ui_value_row(lv_obj_t *parent, meta_id_t id, lv_obj_t **value_label)
{
    lv_obj_t *row = lv_obj_create(parent);
    lv_obj_t *name = lv_label_create(row);

    lv_obj_set_size(row, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_grow(name, 1);
    lv_obj_set_height(name, lv_font_get_line_height(lv_obj_get_style_text_font(name, LV_PART_MAIN)));
    lv_label_set_long_mode(name, LV_LABEL_LONG_DOT); /* before binding, see "Long labels" */
    meta_lvgl_label(name, id, META_TEXT_LABEL);

    *value_label = lv_label_create(row);
    return row;
}

/* Call when the raw value changed and after meta_lvgl_set_language(). */
void ui_value_row_update(lv_obj_t *value_label, meta_id_t id, int32_t raw)
{
    char text[32];
    lv_label_set_text(value_label, meta_lvgl_format(id, raw, text, sizeof text));
}
```

A choice between value texts (Off / On, operating modes):

```c
/* Drop-down list with the value texts of an entry; cb is called on LV_EVENT_VALUE_CHANGED. */
lv_obj_t *ui_choice(lv_obj_t *parent, meta_id_t id, int32_t value, lv_event_cb_t cb)
{
    lv_obj_t *dropdown = lv_dropdown_create(parent);
    if (meta_lvgl_dropdown(dropdown, id, value) == 0) {
        lv_obj_add_flag(dropdown, LV_OBJ_FLAG_HIDDEN); /* the entry has no value texts */
    }
    lv_obj_add_event_cb(dropdown, cb, LV_EVENT_VALUE_CHANGED, (void *)(uintptr_t)id);
    return dropdown;
}

/* In cb: the chosen value (not the position in the list); false if nothing is selected. */
bool ui_choice_value(lv_event_t *e, int32_t *value)
{
    meta_id_t id = (meta_id_t)(uintptr_t)lv_event_get_user_data(e);
    return meta_lvgl_dropdown_value(lv_event_get_target_obj(e), id, value);
}
```

A list driven by object dictionary addresses, and the title of an ARRAY or
RECORD:

```c
typedef struct {
    uint16_t index;
    uint8_t sub;
    lv_obj_t *value; /* set by ui_param_list(), NULL if the entry is not shown */
} ui_param_t;

/* One row per entry that has a label; entries that are not on the display are skipped. */
void ui_param_list(lv_obj_t *parent, ui_param_t *params, size_t count)
{
    size_t i;
    for (i = 0; i < count; i++) {
        meta_id_t id = meta_find(params[i].index, params[i].sub);
        params[i].value = NULL;
        if (meta_text(id, META_TEXT_LABEL) != NULL) { /* NULL also for META_ID_NONE */
            ui_value_row(parent, id, &params[i].value);
        }
    }
}

/* Title of an ARRAY or RECORD, e.g. "Analog inputs" for 0x2001. */
void ui_group_title(lv_obj_t *label, uint16_t index)
{
    meta_lvgl_label(label, meta_find_object(index), META_TEXT_LABEL);
}
```

A help text, where the entry has one in firmware:

```c
/* Shows the tooltip of an entry in a label, or hides the label. */
void ui_help(lv_obj_t *help_label, meta_id_t id)
{
    if (meta_text(id, META_TEXT_TOOLTIP) != NULL) {
        lv_label_set_long_mode(help_label, LV_LABEL_LONG_WRAP);
        meta_lvgl_label(help_label, id, META_TEXT_TOOLTIP);
        lv_obj_remove_flag(help_label, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(help_label, LV_OBJ_FLAG_HIDDEN);
    }
}
```

A number entered by the user, back to the raw value:

```c
/* Raw value for a displayed number, e.g. 21.5 with multiplier 0.1 gives 215. */
int32_t ui_to_raw(meta_id_t id, float displayed)
{
    float multiplier = meta_multiplier(id);
    float raw = multiplier != 0.0f ? displayed / multiplier : 0.0f;
    return (int32_t)(raw < 0.0f ? raw - 0.5f : raw + 0.5f);
}
```

## Language

`meta_lang_t` follows the order of the languages in the user interface file,
so its numbers can change when a language is added. Store the selected language
as its code ("de"), not as a number. The firmware starts in the fallback
language (`META_LANG_FALLBACK`). The files contain language codes only; names
such as "Deutsch" belong to the firmware.

```c
/* Fills a drop-down list with the language codes, in the order of meta_lang_t. */
void ui_language_list(lv_obj_t *dropdown)
{
    int lang;
    lv_dropdown_clear_options(dropdown);
    for (lang = 0; lang < META_LANG_COUNT; lang++) {
        lv_dropdown_add_option(dropdown, meta_language_code((meta_lang_t)lang), LV_DROPDOWN_POS_LAST);
    }
    lv_dropdown_set_selected(dropdown, (uint32_t)meta_get_language());
}

/* On LV_EVENT_VALUE_CHANGED of that list. Returns the code to store. */
const char *ui_language_selected(lv_obj_t *dropdown)
{
    meta_lvgl_set_language((meta_lang_t)lv_dropdown_get_selected(dropdown));
    /* now update the values the screen formatted itself, e.g. ui_value_row_update() */
    return meta_language_code(meta_get_language());
}

/* At start-up, before the screens are built: selects the stored language. An unknown code keeps the fallback. */
void ui_language_restore(const char *code)
{
    int lang;
    for (lang = 0; code != NULL && lang < META_LANG_COUNT; lang++) {
        if (lv_strcmp(code, meta_language_code((meta_lang_t)lang)) == 0) {
            meta_lvgl_set_language((meta_lang_t)lang);
            return;
        }
    }
}
```

## Long labels

A label may be as long as the user interface file allows (*Max. label* in its
settings, 32 characters by default), and translations differ in length. Lay
out for the longest text, not for the one you see.

- Give labels a width (or `lv_obj_set_flex_grow()`) and a long mode:
  `LV_LABEL_LONG_DOT` to cut with "...", `LV_LABEL_LONG_SCROLL_CIRCULAR` to
  scroll, `LV_LABEL_LONG_WRAP` for several lines. `LV_LABEL_LONG_DOT` needs a
  height as well (one line: the line height of the font), otherwise the label
  wraps instead of cutting.
- **Set the long mode before `meta_lvgl_label()`.** LVGL writes the dots into
  the text buffer, so the helper gives a label in `LV_LABEL_LONG_DOT` a copy
  in RAM and every other label the text in flash. Switching a bound label to
  `LV_LABEL_LONG_DOT` afterwards makes LVGL write into flash (hard fault);
  call `meta_lvgl_label()` again after changing the long mode.
- Do not call `lv_label_set_text_static()` with a text from `meta_text()`
  yourself for a label that uses `LV_LABEL_LONG_DOT`, for the same reason.
- Never shorten a text with `strncpy()` or a fixed buffer: the texts are UTF-8
  and a cut inside a character shows garbage.

## Fonts

A character that is not in the font shows as a box. `meta_glyphs.txt` lists
every character of the exported texts in all exported languages. Whenever
`meta.c` is regenerated, build the fonts again from it and add what the
firmware prints itself: digits, sign, decimal point and the characters of its
own literals. With `lv_font_conv` that is the ASCII range plus the symbols of
the file:

```bash
lv_font_conv --font <font>.ttf --size 16 --bpp 4 --format lvgl --no-compress \
    --range 0x20-0x7E --symbols "$(cat meta_glyphs.txt)" -o ui_font_16.c
```

Use the font for every widget that shows meta texts. A new text with a new
character (e.g. "µ" in a unit) therefore needs both steps: regenerate
`meta.c` and regenerate the fonts.

## Regenerating

After every change of `<device>.xui` or `<device>.xdd`:

```bash
EDSSharp --export-project --infile <device>.xui --odfile <device>.xdd \
    --outdir <folder of meta.c> --glyphs <folder of meta.c>/meta_glyphs.txt
```

- `EDSSharp` is `EDSSharp.exe` on Windows or `dotnet EDSSharp.dll`; it has to
  be newer than release `protronic-v4.2.3.12` to read `.xui` files.
- Keep `--odfile`: it supplies the object dictionary addresses and their UI
  addresses. Without it EDSSharp looks for the object dictionary named in the
  `.xui` next to that file and, if it is not there, knows only the addresses
  of the `.xui` itself (with a warning).
- Do not pass `--od` or `--odname`; they rename the files and the `meta_`
  prefix this file relies on.
- `--langs de,en` exports only some languages (smaller flash). Missing texts
  are then filled from the fallback language of the file.
- Lines starting with `WARNING` (text longer than the maximum, unknown UI
  address, UI address of an entry that is not exported) are findings in the
  `.xui`. Report them; do not hide them.
- The summary line (`20 meta entries, … approx. 832 bytes of constant data`)
  gives the number of entries and the size of the tables in flash.

Add `meta.c` and `meta_lvgl.c` to the build and their folder to the include
path. Nothing else is needed.

## Before you finish

- No new string literal with a label, unit, value text or help text of an
  object dictionary entry, and no hard-coded scale factor.
- `meta.c`, `meta.h`, `meta_glyphs.txt`, `meta.json` unchanged, or regenerated
  by the command above together with the fonts.
- Every label that shows a meta text has a long mode that was set before
  `meta_lvgl_label()`.
- Values and other texts the code formats itself are updated after
  `meta_lvgl_set_language()`.
- The firmware builds, and `meta.c` compiles without warnings, e.g. on the
  host: `gcc -std=c99 -Wall -Wextra -Werror -pedantic -fsyntax-only meta.c`.

## If something is missing

| Symptom | Cause | What to do |
|---|---|---|
| `META_H…` is undefined | The entry was removed, is switched off (*On display*), has no texts, or uses the texts of another entry | Use `meta_find()` for an address that borrows texts; otherwise the entry has to be enabled or given texts in the editor |
| Label stays empty | No text of this kind for the entry in any language, or tooltip without *also in firmware* | Fix in the editor and regenerate; report it if you cannot |
| Text appears in the fallback language | No translation for the selected language | Translate in the editor (its *Checks* list the gaps) |
| Boxes instead of characters | Font built before the text was added | Rebuild the fonts from `meta_glyphs.txt` |
| Text does not change with the language | Widget not bound with the helper, or text copied before the change | Bind with `meta_lvgl_label()` / `meta_lvgl_dropdown()`, or update after `meta_lvgl_set_language()` |
| Hard fault when a long label is drawn | Label switched to `LV_LABEL_LONG_DOT` after binding, or `lv_label_set_text_static()` with a meta text | Set the long mode first, then call `meta_lvgl_label()` |
| Value shows without decimals or unit | No multiplier or unit for the entry | Set them in the editor (tab *User Interface*, *Unit* and *Multiplier*) |
