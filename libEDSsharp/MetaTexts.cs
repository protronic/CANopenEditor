/*
    This file is part of libEDSsharp.

    libEDSsharp is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    libEDSsharp is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with libEDSsharp.  If not, see <http://www.gnu.org/licenses/>.
*/

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using CanOpenXSD_1_1;
using LibCanOpen;

namespace libEDSsharp
{
    /// <summary>
    /// Project wide settings for the display texts (meta texts), see docs/meta-texts.md
    /// </summary>
    public class MetaTextInfo
    {
        /// <summary>Languages of the texts in display order, e.g. "de", "en"</summary>
        public List<string> Languages = new List<string>();
        /// <summary>Language used where a text is missing in the selected language</summary>
        public string FallbackLanguage = "";
        /// <summary>Maximum length in characters per text kind, e.g. "label" = 16</summary>
        public SortedDictionary<string, uint> MaxLength = new SortedDictionary<string, uint>(StringComparer.Ordinal);
        /// <summary>True, if the file is a meta project: it holds the texts for another object dictionary</summary>
        public bool MetaProject = false;
        /// <summary>File name of the object dictionary the meta project belongs to</summary>
        public string MetaSource = "";

        /// <summary>True, if nothing is set</summary>
        public bool IsEmpty
        {
            get
            {
                return Languages.Count == 0 && string.IsNullOrEmpty(FallbackLanguage) && MaxLength.Count == 0
                    && !MetaProject && string.IsNullOrEmpty(MetaSource);
            }
        }

        /// <summary>
        /// Deep clone
        /// </summary>
        /// <returns>a deep clone</returns>
        public MetaTextInfo Clone()
        {
            return new MetaTextInfo
            {
                Languages = new List<string>(Languages),
                FallbackLanguage = FallbackLanguage,
                MaxLength = new SortedDictionary<string, uint>(MaxLength, StringComparer.Ordinal),
                MetaProject = MetaProject,
                MetaSource = MetaSource
            };
        }
    }

    /// <summary>
    /// Address of a meta entry: object index and, for sub entries, the sub-index
    /// </summary>
    public struct MetaAddress : IEquatable<MetaAddress>, IComparable<MetaAddress>
    {
        /// <summary>Object index</summary>
        public UInt16 Index;
        /// <summary>Sub-index, or null for the object itself (ARRAY or RECORD)</summary>
        public byte? SubIndex;

        /// <summary>
        /// Creates an address
        /// </summary>
        /// <param name="index">object index</param>
        /// <param name="subIndex">sub-index, or null for the object itself</param>
        public MetaAddress(UInt16 index, byte? subIndex)
        {
            Index = index;
            SubIndex = subIndex;
        }

        private static readonly Regex pattern = new Regex(
            @"^\s*(?:0x)?([0-9a-f]{1,4})\s*(?::\s*(?:0x)?([0-9a-f]{1,2}))?\s*$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

        /// <summary>
        /// Parses "0x1400", "1400", "0x1400:01" or "1400:1"; index and sub-index are hexadecimal
        /// </summary>
        /// <param name="text">address text</param>
        /// <param name="address">parsed address</param>
        /// <returns>true, if the text is a valid address</returns>
        public static bool TryParse(string text, out MetaAddress address)
        {
            address = default;
            if (text == null)
                return false;
            Match m = pattern.Match(text);
            if (!m.Success)
                return false;
            UInt16 index = UInt16.Parse(m.Groups[1].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            byte? sub = null;
            if (m.Groups[2].Success)
                sub = byte.Parse(m.Groups[2].Value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
            address = new MetaAddress(index, sub);
            return true;
        }

        /// <summary>Canonical text, e.g. "0x1400" or "0x1400:01"</summary>
        public override string ToString()
        {
            return SubIndex.HasValue
                ? string.Format("0x{0:X4}:{1:X2}", Index, SubIndex.Value)
                : string.Format("0x{0:X4}", Index);
        }

        /// <inheritdoc/>
        public bool Equals(MetaAddress other) { return Index == other.Index && SubIndex == other.SubIndex; }
        /// <inheritdoc/>
        public override bool Equals(object obj) { return obj is MetaAddress other && Equals(other); }
        /// <inheritdoc/>
        public override int GetHashCode() { return (Index << 9) | (SubIndex.HasValue ? SubIndex.Value : 0x100); }
        /// <summary>Objects sort before their sub entries, sub entries by sub-index</summary>
        public int CompareTo(MetaAddress other)
        {
            if (Index != other.Index)
                return Index.CompareTo(other.Index);
            int a = SubIndex.HasValue ? SubIndex.Value : -1;
            int b = other.SubIndex.HasValue ? other.SubIndex.Value : -1;
            return a.CompareTo(b);
        }
    }

    /// <summary>
    /// Storage of display texts (meta texts) as custom properties, see docs/meta-texts.md
    /// </summary>
    public static class MetaTexts
    {
        /// <summary>Prefix of text properties, followed by "&lt;kind&gt;:&lt;language&gt;"</summary>
        public const string TextPropertyPrefix = "CO_text:";
        /// <summary>Property with the address of the meta entry whose texts apply</summary>
        public const string MetaRefProperty = "CO_metaRef";
        /// <summary>Property with the text kinds exported into firmware although not exported by default</summary>
        public const string TextExportProperty = "CO_textExport";
        /// <summary>Property with the multiplier from the raw value to the displayed value</summary>
        public const string MultiplierProperty = "CO_multiplier";

        /// <summary>Entry of CO_textExport: the entry is not shown on the display, none of its texts are exported
        /// into firmware; on an ARRAY or RECORD object this includes its sub entries</summary>
        public const string ExportNone = "none";

        /// <summary>Text kind: short label for touch displays</summary>
        public const string KindLabel = "label";
        /// <summary>Text kind: tooltip</summary>
        public const string KindTooltip = "tooltip";
        /// <summary>Text kind: description for web pages, never exported into firmware</summary>
        public const string KindDescription = "description";
        /// <summary>Text kind: unit of the value, e.g. "°C"</summary>
        public const string KindUnit = "unit";
        /// <summary>Prefix of the text kind for the text of one value, followed by the value, e.g. "value.1"</summary>
        public const string KindValuePrefix = "value.";

        /// <summary>Characteristic (XDD DeviceFunction) with the languages, one content per language</summary>
        public const string LanguagesCharacteristic = "CO_textLanguages";
        /// <summary>Characteristic with the fallback language</summary>
        public const string FallbackCharacteristic = "CO_textFallbackLanguage";
        /// <summary>Characteristic with the maximum lengths, one content "kind=length" per text kind</summary>
        public const string MaxLengthCharacteristic = "CO_textMaxLength";
        /// <summary>Characteristic marking a meta project, content "true"</summary>
        public const string MetaProjectCharacteristic = "CO_metaProject";
        /// <summary>Characteristic with the file name of the object dictionary of a meta project</summary>
        public const string MetaSourceCharacteristic = "CO_metaSource";

        private static readonly string[] characteristicNames =
        {
            LanguagesCharacteristic, FallbackCharacteristic, MaxLengthCharacteristic,
            MetaProjectCharacteristic, MetaSourceCharacteristic
        };

        /// <summary>
        /// Builds the key of a text
        /// </summary>
        /// <param name="kind">text kind, e.g. "label" or "value.1"</param>
        /// <param name="language">language, e.g. "de"</param>
        /// <returns>key "kind:language"</returns>
        public static string Key(string kind, string language)
        {
            return kind + ":" + language;
        }

        /// <summary>
        /// Splits the key of a text into text kind and language
        /// </summary>
        /// <param name="key">key "kind:language"</param>
        /// <param name="kind">text kind</param>
        /// <param name="language">language</param>
        /// <returns>true, if the key is valid</returns>
        public static bool SplitKey(string key, out string kind, out string language)
        {
            kind = null;
            language = null;
            if (string.IsNullOrEmpty(key))
                return false;
            int pos = key.LastIndexOf(':');
            if (pos <= 0 || pos == key.Length - 1)
                return false;
            kind = key.Substring(0, pos);
            language = key.Substring(pos + 1);
            return true;
        }

        /// <summary>
        /// Value of a value text kind, e.g. 1 for "value.1"
        /// </summary>
        /// <param name="kind">text kind</param>
        /// <param name="value">the value</param>
        /// <returns>true, if the kind is a value text with a valid integer value (decimal or 0x hexadecimal)</returns>
        public static bool TryParseValueKind(string kind, out long value)
        {
            value = 0;
            if (kind == null || !kind.StartsWith(KindValuePrefix, StringComparison.Ordinal))
                return false;
            string text = kind.Substring(KindValuePrefix.Length).Trim();
            bool negative = text.StartsWith("-", StringComparison.Ordinal);
            if (negative)
                text = text.Substring(1);
            bool ok = text.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
                ? long.TryParse(text.Substring(2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out value)
                : long.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out value);
            if (negative)
                value = -value;
            return ok;
        }

        /// <summary>
        /// Text key of a custom property name, e.g. "label:de" for "CO_text:label:de"
        /// </summary>
        /// <param name="propertyName">name of the custom property</param>
        /// <returns>the key, or null, if the property is not a text</returns>
        public static string TextKeyFromProperty(string propertyName)
        {
            if (propertyName == null || !propertyName.StartsWith(TextPropertyPrefix, StringComparison.Ordinal))
                return null;
            string key = propertyName.Substring(TextPropertyPrefix.Length);
            return SplitKey(key, out _, out _) ? key : null;
        }

        /// <summary>
        /// Splits a comma separated list, removing empty entries
        /// </summary>
        /// <param name="text">list text, may be null</param>
        /// <returns>the entries</returns>
        public static List<string> SplitList(string text)
        {
            return (text ?? "").Split(',').Select(s => s.Trim()).Where(s => s.Length > 0).ToList();
        }

        /// <summary>
        /// True if the texts of an object or sub entry are not exported into firmware (CO_textExport contains "none")
        /// </summary>
        public static bool IsExportOff(CustomProperties prop)
        {
            return prop != null && prop.CO_textExport.Contains(ExportNone);
        }

        /// <summary>
        /// Custom properties for the texts of one object or sub entry
        /// </summary>
        /// <param name="texts">texts, key "kind:language"</param>
        /// <param name="metaRef">address of the meta entry, may be empty</param>
        /// <param name="textExport">text kinds exported into firmware although not exported by default</param>
        /// <param name="multiplier">multiplier from the raw value to the displayed value, may be empty</param>
        /// <returns>the properties, empty if nothing is set</returns>
        public static property[] ToProperties(IEnumerable<KeyValuePair<string, string>> texts, string metaRef,
            IEnumerable<string> textExport, string multiplier)
        {
            var props = new List<property>();
            if (texts != null)
            {
                foreach (var kvp in texts.OrderBy(t => t.Key, StringComparer.Ordinal))
                {
                    if (SplitKey(kvp.Key, out _, out _) && !string.IsNullOrEmpty(kvp.Value))
                        props.Add(new property { name = TextPropertyPrefix + kvp.Key, value = kvp.Value });
                }
            }
            if (!string.IsNullOrEmpty(metaRef))
                props.Add(new property { name = MetaRefProperty, value = metaRef });
            string export = textExport == null ? "" : string.Join(",", textExport.Where(s => !string.IsNullOrEmpty(s)));
            if (export != "")
                props.Add(new property { name = TextExportProperty, value = export });
            if (!string.IsNullOrEmpty(multiplier))
                props.Add(new property { name = MultiplierProperty, value = multiplier });
            return props.ToArray();
        }

        /// <summary>
        /// Custom properties for the display texts of a protobuf object or sub entry
        /// </summary>
        /// <param name="meta">display texts, may be null</param>
        /// <returns>the properties, empty if nothing is set</returns>
        public static property[] ToProperties(OdMetaTexts meta)
        {
            if (meta == null)
                return new property[0];
            return ToProperties(meta.Texts, meta.MetaRef, meta.TextExport, meta.Multiplier);
        }

        /// <summary>
        /// Merges two sets of display texts, the first one takes precedence
        /// </summary>
        /// <param name="first">display texts, may be null</param>
        /// <param name="second">display texts, may be null</param>
        /// <returns>merged texts, or null if both are null</returns>
        public static OdMetaTexts Merge(OdMetaTexts first, OdMetaTexts second)
        {
            if (first == null || second == null)
                return first ?? second;
            var merged = second.Clone();
            foreach (var t in first.Texts)
                merged.Texts[t.Key] = t.Value;
            if (first.MetaRef != "")
                merged.MetaRef = first.MetaRef;
            foreach (string kind in first.TextExport.Where(k => !merged.TextExport.Contains(k)))
                merged.TextExport.Add(kind);
            if (first.Multiplier != "")
                merged.Multiplier = first.Multiplier;
            return merged;
        }

        /// <summary>
        /// Display texts of a protobuf object or sub entry from the custom properties of the EDS model
        /// </summary>
        /// <param name="prop">custom properties</param>
        /// <returns>display texts, or null if none are set</returns>
        public static OdMetaTexts ToProtobuf(CustomProperties prop)
        {
            if (prop == null || (prop.CO_texts.Count == 0 && string.IsNullOrEmpty(prop.CO_metaRef)
                && prop.CO_textExport.Count == 0 && string.IsNullOrEmpty(prop.CO_multiplier)))
                return null;
            var meta = new OdMetaTexts { MetaRef = prop.CO_metaRef ?? "", Multiplier = prop.CO_multiplier ?? "" };
            foreach (var t in prop.CO_texts)
                meta.Texts[t.Key] = t.Value;
            meta.TextExport.AddRange(prop.CO_textExport);
            return meta;
        }

        /// <summary>
        /// Copies the display texts of a protobuf object or sub entry into the custom properties of the EDS model
        /// </summary>
        /// <param name="meta">display texts, may be null</param>
        /// <param name="prop">custom properties</param>
        public static void FromProtobuf(OdMetaTexts meta, CustomProperties prop)
        {
            if (meta == null)
                return;
            foreach (var t in meta.Texts)
                prop.CO_texts[t.Key] = t.Value;
            prop.CO_metaRef = meta.MetaRef ?? "";
            prop.CO_textExport = new List<string>(meta.TextExport);
            prop.CO_multiplier = meta.Multiplier ?? "";
        }

        /// <summary>
        /// Concatenates property arrays, either may be null
        /// </summary>
        /// <param name="a">first properties</param>
        /// <param name="b">second properties</param>
        /// <returns>all properties</returns>
        public static property[] Concat(property[] a, property[] b)
        {
            return (a ?? new property[0]).Concat(b ?? new property[0]).ToArray();
        }

        /// <summary>
        /// Reads the project wide text settings from the characteristics of the XDD device profile
        /// </summary>
        /// <param name="body_device">device profile body, may be null</param>
        /// <returns>the settings (empty, if none are stored)</returns>
        public static MetaTextInfo ReadTextInfo(ProfileBody_Device_CANopen body_device)
        {
            var info = new MetaTextInfo();
            foreach (characteristic c in Characteristics(body_device))
            {
                string name = LabelText(c.characteristicName?.Items);
                List<string> contents = (c.characteristicContent ?? new characteristicContent[0])
                    .Select(cc => LabelText(cc?.Items))
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
                switch (name)
                {
                    case LanguagesCharacteristic:
                        info.Languages = contents;
                        break;
                    case FallbackCharacteristic:
                        info.FallbackLanguage = contents.FirstOrDefault() ?? "";
                        break;
                    case MaxLengthCharacteristic:
                        foreach (string content in contents)
                        {
                            string[] parts = content.Split('=');
                            if (parts.Length == 2 && uint.TryParse(parts[1].Trim(), NumberStyles.None, CultureInfo.InvariantCulture, out uint length))
                                info.MaxLength[parts[0].Trim()] = length;
                        }
                        break;
                    case MetaProjectCharacteristic:
                        info.MetaProject = contents.FirstOrDefault() == "true";
                        break;
                    case MetaSourceCharacteristic:
                        info.MetaSource = contents.FirstOrDefault() ?? "";
                        break;
                }
            }
            return info;
        }

        /// <summary>
        /// Writes the project wide text settings as characteristics into the XDD device profile.
        /// Previously stored text settings are replaced, other characteristics are kept.
        /// </summary>
        /// <param name="body_device">device profile body</param>
        /// <param name="info">the settings, may be null</param>
        public static void WriteTextInfo(ProfileBody_Device_CANopen body_device, MetaTextInfo info)
        {
            if (body_device == null)
                return;

            // remove stored text settings
            if (body_device.DeviceFunction != null)
            {
                foreach (DeviceFunction df in body_device.DeviceFunction)
                {
                    if (df?.capabilities?.characteristicsList == null)
                        continue;
                    foreach (characteristicsList list in df.capabilities.characteristicsList)
                    {
                        if (list?.characteristic != null)
                            list.characteristic = list.characteristic
                                .Where(c => !characteristicNames.Contains(LabelText(c?.characteristicName?.Items)))
                                .ToArray();
                    }
                }
            }

            if (info == null || info.IsEmpty)
                return;

            var added = new List<characteristic>();
            if (info.MetaProject)
                added.Add(Characteristic(MetaProjectCharacteristic, new[] { "true" }));
            if (!string.IsNullOrEmpty(info.MetaSource))
                added.Add(Characteristic(MetaSourceCharacteristic, new[] { info.MetaSource }));
            if (info.Languages.Count > 0)
                added.Add(Characteristic(LanguagesCharacteristic, info.Languages));
            if (!string.IsNullOrEmpty(info.FallbackLanguage))
                added.Add(Characteristic(FallbackCharacteristic, new[] { info.FallbackLanguage }));
            if (info.MaxLength.Count > 0)
                added.Add(Characteristic(MaxLengthCharacteristic,
                    info.MaxLength.Select(kvp => kvp.Key + "=" + kvp.Value.ToString(CultureInfo.InvariantCulture))));

            if (body_device.DeviceFunction == null || body_device.DeviceFunction.Length == 0 || body_device.DeviceFunction[0] == null)
                body_device.DeviceFunction = new DeviceFunction[] { new DeviceFunction() };
            DeviceFunction function = body_device.DeviceFunction[0];
            if (function.capabilities == null)
                function.capabilities = new capabilities();
            if (function.capabilities.characteristicsList == null || function.capabilities.characteristicsList.Length == 0
                || function.capabilities.characteristicsList[0] == null)
                function.capabilities.characteristicsList = new characteristicsList[] { new characteristicsList() };
            characteristicsList target = function.capabilities.characteristicsList[0];
            target.characteristic = (target.characteristic ?? new characteristic[0]).Concat(added).ToArray();
        }

        /// <summary>
        /// Converts the project wide text settings into the protobuf message
        /// </summary>
        /// <param name="info">the settings, may be null</param>
        /// <returns>the message, or null, if nothing is set</returns>
        public static CanOpen_TextInfo ToProtobuf(MetaTextInfo info)
        {
            if (info == null || info.IsEmpty)
                return null;
            var msg = new CanOpen_TextInfo
            {
                FallbackLanguage = info.FallbackLanguage ?? "",
                MetaProject = info.MetaProject,
                MetaSource = info.MetaSource ?? ""
            };
            msg.Languages.AddRange(info.Languages);
            foreach (var kvp in info.MaxLength)
                msg.MaxLength[kvp.Key] = kvp.Value;
            return msg;
        }

        /// <summary>
        /// Converts the protobuf message into the project wide text settings
        /// </summary>
        /// <param name="msg">the message, may be null</param>
        /// <returns>the settings (empty, if the message is null)</returns>
        public static MetaTextInfo FromProtobuf(CanOpen_TextInfo msg)
        {
            var info = new MetaTextInfo();
            if (msg == null)
                return info;
            info.Languages.AddRange(msg.Languages);
            info.FallbackLanguage = msg.FallbackLanguage ?? "";
            foreach (var kvp in msg.MaxLength)
                info.MaxLength[kvp.Key] = kvp.Value;
            info.MetaProject = msg.MetaProject;
            info.MetaSource = msg.MetaSource ?? "";
            return info;
        }

        private static IEnumerable<characteristic> Characteristics(ProfileBody_Device_CANopen body_device)
        {
            if (body_device?.DeviceFunction == null)
                yield break;
            foreach (DeviceFunction df in body_device.DeviceFunction)
            {
                if (df?.capabilities?.characteristicsList == null)
                    continue;
                foreach (characteristicsList list in df.capabilities.characteristicsList)
                {
                    if (list?.characteristic == null)
                        continue;
                    foreach (characteristic c in list.characteristic)
                    {
                        if (c != null)
                            yield return c;
                    }
                }
            }
        }

        private static characteristic Characteristic(string name, IEnumerable<string> contents)
        {
            return new characteristic
            {
                characteristicName = new characteristicName
                {
                    Items = new object[] { new vendorTextLabel { lang = "en", Value = name } }
                },
                characteristicContent = contents.Select(content => new characteristicContent
                {
                    Items = new object[] { new vendorTextLabel { lang = "en", Value = content } }
                }).ToArray()
            };
        }

        private static string LabelText(object[] items)
        {
            if (items == null)
                return null;
            foreach (object o in items)
            {
                if (o is vendorTextLabel label)
                    return label.Value;
            }
            return null;
        }
    }
}
