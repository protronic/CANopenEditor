/*
 * meta_lvgl - display texts (meta.c / meta.h) for LVGL 9 widgets
 *
 * Example for docs/meta-texts.md, see meta_lvgl.h.
 */

#include "meta_lvgl.h"

/* Event sent to all widgets when the language changes */
static uint32_t meta_lvgl_event;

/* Binding stored in the user data of the event callback: kind in bits 0..7, meta entry in bits 8..23 */
#define BIND(id, text) ((void *)(((uintptr_t)(id) << 8) | ((uintptr_t)(text) & 0xFFu)))
#define BIND_ID(p) ((meta_id_t)(((uintptr_t)(p) >> 8) & 0xFFFFu))
#define BIND_TEXT(p) ((meta_text_t)((uintptr_t)(p) & 0xFFu))

static void meta_lvgl_init(void)
{
    if (meta_lvgl_event == 0) {
        meta_lvgl_event = lv_event_register_id();
    }
}

static void label_update(lv_obj_t *label, meta_id_t id, meta_text_t text)
{
    const char *s = meta_text(id, text);
    if (s == NULL) {
        s = "";
    }
    if (lv_label_get_long_mode(label) == LV_LABEL_LONG_DOT) {
        /* LVGL writes the dots into the text itself: it needs a copy in RAM, not the text in flash */
        lv_label_set_text(label, s);
    } else {
        lv_label_set_text_static(label, s);
    }
}

static void label_cb(lv_event_t *e)
{
    void *bind = lv_event_get_user_data(e);
    label_update(lv_event_get_target_obj(e), BIND_ID(bind), BIND_TEXT(bind));
}

void meta_lvgl_label(lv_obj_t *label, meta_id_t id, meta_text_t text)
{
    meta_lvgl_init();
    while (lv_obj_remove_event_cb(label, label_cb)) {
    }
    lv_obj_add_event_cb(label, label_cb, (lv_event_code_t)meta_lvgl_event, BIND(id, text));
    label_update(label, id, text);
}

/* Options "Off\nOn" of the value texts; returns the number of options */
static uint16_t dropdown_update(lv_obj_t *dropdown, meta_id_t id)
{
    uint16_t count = meta_value_count(id);
    uint16_t i;
    size_t len = 1;
    char *options;
    char *p;

    for (i = 0; i < count; i++) {
        const char *s = meta_value_at(id, i, NULL);
        len += (s != NULL ? lv_strlen(s) : 0) + 1;
    }
    options = lv_malloc(len);
    if (options == NULL) {
        return 0;
    }
    p = options;
    for (i = 0; i < count; i++) {
        const char *s = meta_value_at(id, i, NULL);
        if (i > 0) {
            *p++ = '\n';
        }
        if (s != NULL) {
            size_t n = lv_strlen(s);
            lv_memcpy(p, s, n);
            p += n;
        }
    }
    *p = '\0';
    lv_dropdown_set_options(dropdown, options); /* copies the options */
    lv_free(options);
    return count;
}

static void dropdown_cb(lv_event_t *e)
{
    lv_obj_t *dropdown = lv_event_get_target_obj(e);
    uint32_t selected = lv_dropdown_get_selected(dropdown);
    dropdown_update(dropdown, BIND_ID(lv_event_get_user_data(e)));
    lv_dropdown_set_selected(dropdown, selected);
}

uint16_t meta_lvgl_dropdown(lv_obj_t *dropdown, meta_id_t id, int32_t value)
{
    uint16_t count;
    uint16_t i;

    meta_lvgl_init();
    while (lv_obj_remove_event_cb(dropdown, dropdown_cb)) {
    }
    lv_obj_add_event_cb(dropdown, dropdown_cb, (lv_event_code_t)meta_lvgl_event, BIND(id, 0));
    count = dropdown_update(dropdown, id);
    for (i = 0; i < count; i++) {
        int32_t v;
        if (meta_value_at(id, i, &v) != NULL && v == value) {
            lv_dropdown_set_selected(dropdown, i);
            break;
        }
    }
    return count;
}

bool meta_lvgl_dropdown_value(lv_obj_t *dropdown, meta_id_t id, int32_t *value)
{
    uint32_t selected = lv_dropdown_get_selected(dropdown);
    return selected < meta_value_count(id) && meta_value_at(id, (uint16_t)selected, value) != NULL;
}

/* Appends s to buf at pos; returns the new position */
static size_t append(char *buf, size_t size, size_t pos, const char *s)
{
    while (*s != '\0' && pos + 1 < size) {
        buf[pos++] = *s++;
    }
    buf[pos] = '\0';
    return pos;
}

/* Appends the decimal number n with at least width digits */
static size_t append_u32(char *buf, size_t size, size_t pos, uint32_t n, uint8_t width)
{
    char digits[11];
    uint8_t len = 0;
    do {
        digits[len++] = (char)('0' + n % 10u);
        n /= 10u;
    } while (n != 0u || len < width);
    while (len > 0 && pos + 1 < size) {
        buf[pos++] = digits[--len];
    }
    buf[pos] = '\0';
    return pos;
}

char *meta_lvgl_format(meta_id_t id, int32_t raw, char *buf, size_t size)
{
    const char *text = meta_value_text(id, raw);
    const char *unit;
    uint8_t decimals;
    uint32_t pow10 = 1;
    uint32_t abs_value;
    float scaled;
    size_t pos = 0;
    uint8_t i;

    if (buf == NULL || size == 0) {
        return buf;
    }
    buf[0] = '\0';
    if (text != NULL) {
        append(buf, size, 0, text);
        return buf;
    }

    decimals = meta_decimals(id);
    if (decimals > 9) {
        decimals = 9;
    }
    for (i = 0; i < decimals; i++) {
        pow10 *= 10u;
    }
    scaled = (float)raw * meta_multiplier(id) * (float)pow10;
    if (scaled < 0.0f) {
        scaled = -scaled;
        if (scaled >= 0.5f) {
            pos = append(buf, size, pos, "-");
        }
    }
    abs_value = scaled >= 4294967295.0f ? 0xFFFFFFFFu : (uint32_t)(scaled + 0.5f);

    pos = append_u32(buf, size, pos, abs_value / pow10, 1);
    if (decimals > 0) {
        pos = append(buf, size, pos, ".");
        pos = append_u32(buf, size, pos, abs_value % pow10, decimals);
    }
    unit = meta_text(id, META_TEXT_UNIT);
    if (unit != NULL) {
        pos = append(buf, size, pos, " ");
        append(buf, size, pos, unit);
    }
    return buf;
}

static lv_obj_tree_walk_res_t walk_cb(lv_obj_t *obj, void *user_data)
{
    LV_UNUSED(user_data);
    lv_obj_send_event(obj, (lv_event_code_t)meta_lvgl_event, NULL);
    return LV_OBJ_TREE_WALK_NEXT;
}

void meta_lvgl_set_language(meta_lang_t lang)
{
    meta_set_language(lang);
    if (meta_lvgl_event != 0) {
        lv_obj_tree_walk(NULL, walk_cb, NULL); /* NULL: all screens of all displays */
    }
}
