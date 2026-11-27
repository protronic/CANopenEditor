/*
 * meta_lvgl - display texts (meta.c / meta.h) for LVGL 9 widgets
 *
 * Example for docs/meta-texts.md. Labels and drop-down lists bound with these
 * functions follow meta_lvgl_set_language() automatically. Texts are set with
 * lv_label_set_text_static(): they stay in flash and are not copied. Only a
 * label in the long mode LV_LABEL_LONG_DOT gets a copy, because LVGL writes the
 * dots into the text.
 *
 * Copy this file into the firmware and adapt it; it is not generated.
 */

#ifndef META_LVGL_H
#define META_LVGL_H

#include "lvgl.h"
#include "meta.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Shows a text of a meta entry in a label and keeps it up to date when the
 * language changes. Missing texts show as empty label.
 *
 * Set the long mode of the label (lv_label_set_long_mode()) before this call;
 * to change it to or from LV_LABEL_LONG_DOT later, call this function again.
 *
 * @param label LVGL label.
 * @param id Meta entry, e.g. META_H2100 or meta_find(0x2100, 0).
 * @param text Text kind, e.g. META_TEXT_LABEL.
 */
void meta_lvgl_label(lv_obj_t *label, meta_id_t id, meta_text_t text);

/**
 * Fills a drop-down list with the value texts of a meta entry (e.g. Off / On)
 * and keeps them up to date when the language changes.
 *
 * @param dropdown LVGL drop-down list.
 * @param id Meta entry with value texts.
 * @param value Value to select.
 * @return Number of options.
 */
uint16_t meta_lvgl_dropdown(lv_obj_t *dropdown, meta_id_t id, int32_t value);

/**
 * Value of the selected option of a drop-down list filled by meta_lvgl_dropdown().
 *
 * @param dropdown LVGL drop-down list.
 * @param id Meta entry the list was filled with.
 * @param [out] value Value of the selected option.
 * @return true, if an option is selected.
 */
bool meta_lvgl_dropdown_value(lv_obj_t *dropdown, meta_id_t id, int32_t *value);

/**
 * Formats a raw value for display: multiplier, decimal places and unit of the
 * meta entry, e.g. raw 215 with multiplier 0.1 and unit "°C" gives "21.5 °C".
 * Value texts take precedence (raw 1 with value text "On" gives "On").
 * Works without floating point printf.
 *
 * @param id Meta entry.
 * @param raw Raw value from the object dictionary.
 * @param buf Buffer for the text.
 * @param size Size of buf.
 * @return buf
 */
char *meta_lvgl_format(meta_id_t id, int32_t raw, char *buf, size_t size);

/**
 * Selects the language and updates all labels and drop-down lists bound with
 * meta_lvgl_label() and meta_lvgl_dropdown() on all screens.
 */
void meta_lvgl_set_language(meta_lang_t lang);

#ifdef __cplusplus
}
#endif

#endif /* META_LVGL_H */
