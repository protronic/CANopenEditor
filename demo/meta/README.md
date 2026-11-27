# Meta-Projekt (Anzeigetexte) für Demo-IO

Beispiel für die Anzeigetexte aus [`docs/meta-texts.md`](../../docs/meta-texts.md).

| Datei | Inhalt |
|---|---|
| `demo_io.xui` | Meta-Projekt (User Interface, XDD 1.1 mit der Endung `.xui`): Kopie der Objekte ab 0x2000 von `../eds/demo_io.eds` mit Bezeichnungen, Einheiten, Wertetexten, Multiplikatoren und einem Tooltip auf Deutsch und Englisch (Rückfallsprache Deutsch) |
| `meta_lvgl.h`, `meta_lvgl.c` | Beispiel für LVGL 9: Labels und Auswahllisten, die dem Sprachwechsel folgen, und Formatierung von Rohwerten (`215` → `21.5 %`) |

`../generate.sh` erzeugt daraus `generated/demo_io_meta/meta.c` und `meta.h`,
das JSON mit allen Texten für die Weboberfläche und `meta_glyphs.txt` mit allen
verwendeten Zeichen (für `lv_font_conv`).

```bash
dotnet ../EDSSharp/bin/Release/net8.0/EDSSharp.dll --export-project \
    --infile meta/demo_io.xui --outdir generated/demo_io_meta \
    --glyphs generated/demo_io_meta/meta_glyphs.txt
```

Verwendung in der Firmware:

```c
#include "meta_lvgl.h"

meta_lvgl_label(label_temp, META_H2100, META_TEXT_LABEL);       /* "Temperatur" / "Temperature" */
meta_lvgl_dropdown(dd_out1, meta_find(0x2000, 1), out1_value);  /* "Aus\nEin" / "Off\nOn" */

char text[24];
lv_label_set_text(value_setpoint, meta_lvgl_format(META_H2101, OD_RAM.x2101_sollwert, text, sizeof text));

meta_lvgl_set_language(META_LANG_EN);                            /* alle gebundenen Widgets wechseln */
```
