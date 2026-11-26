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
using System.IO;
using System.Linq;
using System.Text;

namespace libEDSsharp
{
    /// <summary>
    /// Exports the display texts (meta texts) of a project as C source: a compact,
    /// read-only dictionary per language (meta.c / meta.h). See docs/meta-texts.md.
    /// </summary>
    public class CanOpenNodeMetaExporter : IFileExporter
    {
        /// <summary>Text kinds exported for every entry; other kinds only where listed in CO_textExport</summary>
        public static readonly string[] DefaultExportedKinds = { MetaTexts.KindLabel, MetaTexts.KindUnit };

        /// <summary>Text kinds which always get a constant in the generated enum, in this order</summary>
        public static readonly string[] StandardKinds = { MetaTexts.KindLabel, MetaTexts.KindUnit, MetaTexts.KindTooltip };

        /// <summary>Default maximum lengths in characters, used for warnings only</summary>
        public static readonly IReadOnlyDictionary<string, uint> DefaultMaxLength = new Dictionary<string, uint>
        {
            { MetaTexts.KindLabel, 16 },
            { MetaTexts.KindTooltip, 128 },
            { MetaTexts.KindUnit, 8 },
            { "value", 16 }
        };

        /// <summary>Prefix of the C symbols; null: name of the output file</summary>
        public string Prefix { get; set; }

        /// <summary>Object dictionary whose addresses are mapped to the meta entries; null: the meta project itself,
        /// or the file named in its text settings (MetaSource), if it can be found</summary>
        public EDSsharp SourceOd { get; set; }

        /// <summary>Languages to export; null or empty: all languages of the project</summary>
        public IList<string> Languages { get; set; }

        /// <summary>If set, a text file with all characters used in the exported texts is written to this path</summary>
        public string GlyphFile { get; set; }

        /// <summary>Warnings of the last export (also added to <see cref="Warnings"/>)</summary>
        public List<string> Messages { get; } = new List<string>();

        /// <summary>Statistics of the last export, e.g. for the CLI output</summary>
        public string Summary { get; private set; } = "";

        /// <summary>
        /// Fetches all the different fileexporter types the class supports
        /// </summary>
        /// <returns>List of the different exporters the class supports</returns>
        public ExporterDescriptor[] GetExporters()
        {
            return new ExporterDescriptor[]
            {
                new ExporterDescriptor("CanOpenNode Meta", new string[] { ".h", ".c" }, ExporterDescriptor.ExporterFlags.CanOpenNode, delegate (string filepath, List<EDSsharp> edss)
                {
                    var e = new CanOpenNodeMetaExporter();
                    e.Export(filepath, edss[0]);
                })
            };
        }

        #region model

        private sealed class Entry
        {
            public MetaAddress Address;
            public string Name;
            public bool IsVar;
            public int Id;
            /// <summary>kind -> language -> text</summary>
            public SortedDictionary<string, Dictionary<string, string>> Texts = new SortedDictionary<string, Dictionary<string, string>>(StringComparer.Ordinal);
            /// <summary>value -> language -> text</summary>
            public SortedDictionary<long, Dictionary<string, string>> Values = new SortedDictionary<long, Dictionary<string, string>>();
            public string Multiplier = "";
            public bool HasContent { get { return Texts.Count > 0 || Values.Count > 0 || Multiplier != ""; } }
        }

        private sealed class ValueList
        {
            public string Signature;
            public List<long> Values = new List<long>();
            /// <summary>per language the pool offsets, aligned with Values</summary>
            public Dictionary<string, List<long>> Offsets = new Dictionary<string, List<long>>();
            public int Start;
        }

        private sealed class Pool
        {
            public readonly List<byte> Bytes = new List<byte> { 0 };
            private readonly Dictionary<string, int> offsets = new Dictionary<string, int>(StringComparer.Ordinal);
            public readonly List<KeyValuePair<int, string>> Strings = new List<KeyValuePair<int, string>>();

            public int Add(string text)
            {
                if (string.IsNullOrEmpty(text))
                    return 0;
                if (offsets.TryGetValue(text, out int offset))
                    return offset;
                offset = Bytes.Count;
                Bytes.AddRange(Encoding.UTF8.GetBytes(text));
                Bytes.Add(0);
                offsets.Add(text, offset);
                Strings.Add(new KeyValuePair<int, string>(offset, text));
                return offset;
            }
        }

        #endregion

        /// <summary>
        /// Export the display texts of a project into C source files
        /// </summary>
        /// <param name="filepath">path of the output files; ".c" and ".h" are added (an existing extension is replaced)</param>
        /// <param name="meta">project with the texts (meta project or object dictionary with texts)</param>
        public void Export(string filepath, EDSsharp meta)
        {
            Messages.Clear();

            string folder = Path.GetDirectoryName(Path.GetFullPath(filepath));
            string baseName = Path.GetFileName(filepath);
            string ext = Path.GetExtension(baseName).ToLowerInvariant();
            if (ext == ".c" || ext == ".h")
                baseName = Path.GetFileNameWithoutExtension(baseName);

            string prefix = CIdentifier(string.IsNullOrEmpty(Prefix) ? baseName : Prefix);
            string PREFIX = prefix.ToUpperInvariant();

            EDSsharp source = SourceOd ?? FindSource(meta) ?? meta;

            // languages
            List<string> languages = meta.textInfo.Languages.Count > 0
                ? meta.textInfo.Languages.ToList()
                : CollectLanguages(meta);
            // fallback language of the project; if it is not exported, its texts fill the gaps of the exported languages
            string projectFallback = languages.Contains(meta.textInfo.FallbackLanguage) ? meta.textInfo.FallbackLanguage : languages.FirstOrDefault();
            if (Languages != null && Languages.Count > 0)
            {
                foreach (string l in Languages.Where(l => !languages.Contains(l)))
                    Warn($"Language '{l}' is not used in the project");
                languages = languages.Where(l => Languages.Contains(l)).ToList();
            }
            if (languages.Count == 0)
                languages.Add(string.IsNullOrEmpty(meta.textInfo.FallbackLanguage) ? "en" : meta.textInfo.FallbackLanguage);
            string fallback = languages.Contains(meta.textInfo.FallbackLanguage) ? meta.textInfo.FallbackLanguage : languages[0];
            string fillFrom = projectFallback != null && !languages.Contains(projectFallback) ? projectFallback : null;

            // entries
            List<Entry> entries = CollectEntries(meta, languages, fillFrom);
            var byAddress = entries.ToDictionary(e => e.Address);
            entries = entries.Where(e => e.HasContent).ToList();
            for (int i = 0; i < entries.Count; i++)
                entries[i].Id = i;
            if (entries.Count >= 0xFFFF)
                throw new InvalidOperationException("Too many meta entries");

            CheckLengths(meta, entries);

            // text kinds
            var kinds = new List<string>(StandardKinds);
            kinds.AddRange(entries.SelectMany(e => e.Texts.Keys).Distinct().Where(k => !kinds.Contains(k)).OrderBy(k => k, StringComparer.Ordinal));

            // OD address -> meta entry
            var mapping = BuildMapping(source, meta, byAddress);

            // pools and offsets
            var pools = languages.ToDictionary(l => l, l => new Pool());
            // kind -> language -> offset per entry
            var offsets = new Dictionary<string, Dictionary<string, long[]>>();
            foreach (string kind in kinds)
            {
                offsets[kind] = new Dictionary<string, long[]>();
                foreach (string lang in languages)
                {
                    var arr = new long[entries.Count];
                    foreach (Entry e in entries)
                    {
                        if (e.Texts.TryGetValue(kind, out var byLang) && byLang.TryGetValue(lang, out string text))
                            arr[e.Id] = pools[lang].Add(text);
                    }
                    offsets[kind][lang] = arr;
                }
            }

            // value lists, equal lists are stored once
            var lists = new List<ValueList>();
            var listOfEntry = new SortedDictionary<int, int>();
            var listBySignature = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (Entry e in entries.Where(e => e.Values.Count > 0))
            {
                var sig = new StringBuilder();
                foreach (var v in e.Values)
                {
                    sig.Append(v.Key.ToString(CultureInfo.InvariantCulture)).Append('\u0001');
                    foreach (string lang in languages)
                        sig.Append(v.Value.TryGetValue(lang, out string t) ? t : "").Append('\u0002');
                }
                string signature = sig.ToString();
                if (!listBySignature.TryGetValue(signature, out int listIndex))
                {
                    var list = new ValueList { Signature = signature, Start = lists.Sum(l => l.Values.Count) };
                    foreach (string lang in languages)
                        list.Offsets[lang] = new List<long>();
                    foreach (var v in e.Values)
                    {
                        list.Values.Add(v.Key);
                        foreach (string lang in languages)
                            list.Offsets[lang].Add(v.Value.TryGetValue(lang, out string t) ? pools[lang].Add(t) : 0);
                    }
                    listIndex = lists.Count;
                    lists.Add(list);
                    listBySignature.Add(signature, listIndex);
                }
                listOfEntry.Add(e.Id, listIndex);
            }

            // multipliers
            var multipliers = new List<KeyValuePair<Entry, decimal>>();
            foreach (Entry e in entries.Where(e => e.Multiplier != ""))
            {
                if (decimal.TryParse(e.Multiplier, NumberStyles.Float, CultureInfo.InvariantCulture, out decimal m))
                    multipliers.Add(new KeyValuePair<Entry, decimal>(e, m));
                else
                    Warn($"{e.Address}: invalid multiplier '{e.Multiplier}' ignored");
            }

            int maxPool = pools.Values.Max(p => p.Bytes.Count);
            string offsetType = maxPool <= 0xFFFF ? "uint16_t" : "uint32_t";

            var ctx = new Context
            {
                Prefix = prefix,
                PREFIX = PREFIX,
                BaseName = baseName,
                Languages = languages,
                Fallback = fallback,
                Kinds = kinds,
                Entries = entries,
                Mapping = mapping,
                Pools = pools,
                Offsets = offsets,
                Lists = lists,
                ListOfEntry = listOfEntry,
                Multipliers = multipliers,
                OffsetType = offsetType,
                Meta = meta
            };

            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, baseName + ".h"), GenerateHeader(ctx), new UTF8Encoding(false));
            File.WriteAllText(Path.Combine(folder, baseName + ".c"), GenerateSource(ctx), new UTF8Encoding(false));

            if (!string.IsNullOrEmpty(GlyphFile))
                File.WriteAllText(GlyphFile, Glyphs(pools.Values), new UTF8Encoding(false));

            int flash = ctx.FlashEstimate;
            Summary = string.Format(CultureInfo.InvariantCulture,
                "{0} meta entries, {1} OD addresses, {2} languages ({3}), {4} value lists, approx. {5} bytes of constant data",
                entries.Count, mapping.Count, languages.Count, string.Join(", ", languages), lists.Count, flash);
        }

        #region collecting

        private void Warn(string message)
        {
            Messages.Add(message);
            Warnings.AddWarning("Meta export: " + message, Warnings.warning_class.WARNING_BUILD);
        }

        private EDSsharp FindSource(EDSsharp meta)
        {
            string name = meta.textInfo.MetaSource;
            if (string.IsNullOrEmpty(name))
                return null;
            string own = !string.IsNullOrEmpty(meta.projectFilename) ? meta.projectFilename : meta.xddfilename_1_1;
            string path = Path.IsPathRooted(name) || string.IsNullOrEmpty(own)
                ? name
                : Path.Combine(Path.GetDirectoryName(Path.GetFullPath(own)), name);
            if (!File.Exists(path))
            {
                Warn($"Object dictionary '{name}' of the meta project not found; meta addresses are used as OD addresses");
                return null;
            }
            try
            {
                switch (Path.GetExtension(path).ToLowerInvariant())
                {
                    case ".xdd":
                    case ".xdc":
                    case ".xpd":
                        return XddLoader.Load(path);
                    case ".json":
                        return new CanOpenXDD_1_1().ReadProtobuf(path, true);
                    case ".eds":
                    case ".dcf":
                        var eds = new EDSsharp();
                        eds.Loadfile(path);
                        return eds;
                }
            }
            catch (Exception ex)
            {
                Warn($"Object dictionary '{name}' could not be read ({ex.Message}); meta addresses are used as OD addresses");
            }
            return null;
        }

        private static List<string> CollectLanguages(EDSsharp meta)
        {
            var found = new SortedSet<string>(StringComparer.Ordinal);
            foreach (ODentry od in meta.ods.Values)
            {
                foreach (ODentry e in new[] { od }.Concat(od.subobjects.Values))
                {
                    foreach (string key in e.prop.CO_texts.Keys)
                    {
                        if (MetaTexts.SplitKey(key, out _, out string lang))
                            found.Add(lang);
                    }
                }
            }
            var result = found.ToList();
            string fallback = meta.textInfo.FallbackLanguage;
            if (!string.IsNullOrEmpty(fallback))
            {
                result.Remove(fallback);
                result.Insert(0, fallback);
            }
            return result;
        }

        private List<Entry> CollectEntries(EDSsharp meta, List<string> languages, string fillFrom)
        {
            var entries = new List<Entry>();
            foreach (ODentry od in meta.ods.Values)
            {
                if (od.prop.CO_disabled)
                    continue;
                if (od.objecttype == ObjectType.VAR || od.subobjects.Count == 0)
                {
                    entries.Add(MakeEntry(new MetaAddress(od.Index, 0), od.parameter_name, od.prop, languages, fillFrom, true));
                }
                else
                {
                    entries.Add(MakeEntry(new MetaAddress(od.Index, null), od.parameter_name, od.prop, languages, fillFrom, false));
                    foreach (var sub in od.subobjects)
                        entries.Add(MakeEntry(new MetaAddress(od.Index, (byte)sub.Key), sub.Value.parameter_name, sub.Value.prop, languages, fillFrom, false));
                }
            }
            entries.Sort((a, b) => a.Address.CompareTo(b.Address));
            return entries;
        }

        private Entry MakeEntry(MetaAddress address, string name, CustomProperties prop, List<string> languages, string fillFrom, bool isVar)
        {
            var entry = new Entry { Address = address, Name = name ?? "", IsVar = isVar };
            var texts = prop.CO_texts.AsEnumerable();
            if (fillFrom != null)
            {
                // texts of a fallback language that is not exported stand in for missing texts
                var filled = new Dictionary<string, string>(StringComparer.Ordinal);
                foreach (var kvp in prop.CO_texts)
                {
                    if (string.IsNullOrEmpty(kvp.Value) || !MetaTexts.SplitKey(kvp.Key, out string k, out string l) || l != fillFrom)
                        continue;
                    foreach (string target in languages)
                    {
                        string key = MetaTexts.Key(k, target);
                        if (!prop.CO_texts.TryGetValue(key, out string own) || string.IsNullOrEmpty(own))
                            filled[key] = kvp.Value;
                    }
                }
                texts = texts.Concat(filled);
            }
            foreach (var kvp in texts)
            {
                if (string.IsNullOrEmpty(kvp.Value) || !MetaTexts.SplitKey(kvp.Key, out string kind, out string lang) || !languages.Contains(lang))
                    continue;
                if (MetaTexts.TryParseValueKind(kind, out long value))
                {
                    if (value < int.MinValue || value > int.MaxValue)
                    {
                        Warn($"{address}: value {value} does not fit into 32 bit, text ignored");
                        continue;
                    }
                    if (!entry.Values.TryGetValue(value, out var byLang))
                        entry.Values[value] = byLang = new Dictionary<string, string>();
                    byLang[lang] = kvp.Value;
                    continue;
                }
                if (kind.StartsWith(MetaTexts.KindValuePrefix, StringComparison.Ordinal))
                {
                    Warn($"{address}: invalid value text kind '{kind}' ignored");
                    continue;
                }
                if (!DefaultExportedKinds.Contains(kind) && !prop.CO_textExport.Contains(kind))
                    continue;
                if (!entry.Texts.TryGetValue(kind, out var byKind))
                    entry.Texts[kind] = byKind = new Dictionary<string, string>();
                byKind[lang] = kvp.Value;
            }
            string multiplier = (prop.CO_multiplier ?? "").Trim();
            if (multiplier != "" && multiplier != "1")
                entry.Multiplier = multiplier;
            return entry;
        }

        private void CheckLengths(EDSsharp meta, List<Entry> entries)
        {
            uint Max(string kind)
            {
                if (meta.textInfo.MaxLength.TryGetValue(kind, out uint m))
                    return m;
                return DefaultMaxLength.TryGetValue(kind, out m) ? m : 0;
            }
            foreach (Entry e in entries)
            {
                foreach (var kind in e.Texts)
                {
                    uint max = Max(kind.Key);
                    foreach (var t in kind.Value.Where(t => max > 0 && Characters(t.Value) > max))
                        Warn($"{e.Address} {kind.Key}:{t.Key} has {Characters(t.Value)} characters, more than {max}");
                }
                uint maxValue = Max("value");
                foreach (var v in e.Values)
                {
                    foreach (var t in v.Value.Where(t => maxValue > 0 && Characters(t.Value) > maxValue))
                        Warn($"{e.Address} value.{v.Key}:{t.Key} has {Characters(t.Value)} characters, more than {maxValue}");
                }
            }
        }

        private static int Characters(string text)
        {
            int count = 0;
            for (int i = 0; i < text.Length; i++)
            {
                if (!char.IsLowSurrogate(text[i]))
                    count++;
            }
            return count;
        }

        /// <summary>
        /// Maps the addresses of the object dictionary to meta entries, following CO_metaRef
        /// </summary>
        private SortedDictionary<uint, int> BuildMapping(EDSsharp source, EDSsharp meta, Dictionary<MetaAddress, Entry> byAddress)
        {
            var mapping = new SortedDictionary<uint, int>();

            Entry Lookup(MetaAddress target, MetaAddress from)
            {
                // a reference to a VAR without sub-index means the VAR
                if (!target.SubIndex.HasValue && meta.ods.TryGetValue(target.Index, out ODentry t)
                    && (t.objecttype == ObjectType.VAR || t.subobjects.Count == 0))
                    target = new MetaAddress(target.Index, 0);
                if (byAddress.TryGetValue(target, out Entry entry))
                    return entry;
                if (!target.Equals(from))
                    Warn($"{from}: meta address {target} does not exist");
                return null;
            }

            void Add(MetaAddress from, Entry entry)
            {
                if (entry == null || !entry.HasContent)
                    return;
                uint key = ((uint)from.Index << 16) | (from.SubIndex.HasValue ? from.SubIndex.Value : 0x100u);
                mapping[key] = entry.Id;
            }

            bool Ref(string text, MetaAddress from, out MetaAddress target)
            {
                target = default;
                if (string.IsNullOrWhiteSpace(text))
                    return false;
                if (MetaAddress.TryParse(text, out target))
                    return true;
                Warn($"{from}: invalid meta address '{text}' ignored");
                return false;
            }

            foreach (ODentry od in source.ods.Values)
            {
                if (od.prop.CO_disabled)
                    continue;
                bool hasObjRef = Ref(od.prop.CO_metaRef, new MetaAddress(od.Index, null), out MetaAddress objRef);

                if (od.objecttype == ObjectType.VAR || od.subobjects.Count == 0)
                {
                    var own = new MetaAddress(od.Index, 0);
                    var target = hasObjRef ? objRef : own;
                    Add(own, Lookup(target, own));
                    continue;
                }

                var ownObj = new MetaAddress(od.Index, null);
                Add(ownObj, Lookup(hasObjRef ? objRef : ownObj, ownObj));

                foreach (var sub in od.subobjects)
                {
                    var own = new MetaAddress(od.Index, (byte)sub.Key);
                    MetaAddress target;
                    if (Ref(sub.Value.prop.CO_metaRef, own, out MetaAddress subRef))
                        target = subRef.SubIndex.HasValue ? subRef : new MetaAddress(subRef.Index, own.SubIndex);
                    else if (hasObjRef)
                        target = new MetaAddress(objRef.Index, own.SubIndex);
                    else
                        target = own;
                    Add(own, Lookup(target, own));
                }
            }
            return mapping;
        }

        #endregion

        #region generating

        private sealed class Context
        {
            public string Prefix, PREFIX, BaseName, Fallback, OffsetType;
            public List<string> Languages, Kinds;
            public List<Entry> Entries;
            public SortedDictionary<uint, int> Mapping;
            public Dictionary<string, Pool> Pools;
            public Dictionary<string, Dictionary<string, long[]>> Offsets;
            public List<ValueList> Lists;
            public SortedDictionary<int, int> ListOfEntry;
            public List<KeyValuePair<Entry, decimal>> Multipliers;
            public EDSsharp Meta;
            public int FlashEstimate;

            public string Lang(string lang) { return PREFIX + "_LANG_" + CIdentifier(lang).ToUpperInvariant(); }
            public string Kind(string kind) { return PREFIX + "_TEXT_" + CIdentifier(kind).ToUpperInvariant(); }
            public string EntryName(Entry e)
            {
                return e.Address.SubIndex.HasValue && !e.IsVar
                    ? string.Format("{0}_H{1:X4}_{2:X2}", PREFIX, e.Address.Index, e.Address.SubIndex.Value)
                    : string.Format("{0}_H{1:X4}", PREFIX, e.Address.Index);
            }
        }

        private static string GenerateHeader(Context c)
        {
            var sb = new StringBuilder();
            string p = c.Prefix, P = c.PREFIX;
            string guard = P + "_H";

            sb.AppendLine("/*******************************************************************************");
            sb.AppendLine($"    Display texts (meta texts) - {c.BaseName}.h");
            sb.AppendLine();
            sb.AppendLine("    This file was automatically generated by EDSSharp (libedssharp), exporter");
            sb.AppendLine("    \"CanOpenNode Meta\". Do not edit, edit the meta project instead.");
            sb.AppendLine("    Format and usage: docs/meta-texts.md");
            sb.AppendLine();
            sb.AppendLine($"    Project:    {Comment(c.Meta.di.ProductName)}");
            sb.AppendLine($"    Languages:  {string.Join(", ", c.Languages)} (fallback: {c.Fallback})");
            sb.AppendLine($"    Entries:    {c.Entries.Count}");
            sb.AppendLine("*******************************************************************************/");
            sb.AppendLine();
            sb.AppendLine($"#ifndef {guard}");
            sb.AppendLine($"#define {guard}");
            sb.AppendLine();
            sb.AppendLine("#include <stdint.h>");
            sb.AppendLine();
            sb.AppendLine("#ifdef __cplusplus");
            sb.AppendLine("extern \"C\" {");
            sb.AppendLine("#endif");
            sb.AppendLine();
            sb.AppendLine("/** Languages */");
            sb.AppendLine("typedef enum {");
            for (int i = 0; i < c.Languages.Count; i++)
                sb.AppendLine($"    {c.Lang(c.Languages[i])} = {i}, /**< \"{c.Languages[i]}\" */");
            sb.AppendLine($"    {P}_LANG_COUNT = {c.Languages.Count}");
            sb.AppendLine($"}} {p}_lang_t;");
            sb.AppendLine();
            sb.AppendLine("/** Language used where a text is missing in the selected language */");
            sb.AppendLine($"#define {P}_LANG_FALLBACK {c.Lang(c.Fallback)}");
            sb.AppendLine();
            sb.AppendLine("/** Text kinds */");
            sb.AppendLine("typedef enum {");
            for (int i = 0; i < c.Kinds.Count; i++)
                sb.AppendLine($"    {c.Kind(c.Kinds[i])} = {i}, /**< \"{c.Kinds[i]}\" */");
            sb.AppendLine($"    {P}_TEXT_COUNT = {c.Kinds.Count}");
            sb.AppendLine($"}} {p}_text_t;");
            sb.AppendLine();
            sb.AppendLine("/** Number of a meta entry */");
            sb.AppendLine($"typedef uint16_t {p}_id_t;");
            sb.AppendLine();
            sb.AppendLine("/** No meta entry */");
            sb.AppendLine($"#define {P}_ID_NONE 0xFFFFu");
            sb.AppendLine();
            sb.AppendLine("/** Number of meta entries */");
            sb.AppendLine($"#define {P}_ENTRY_COUNT {c.Entries.Count}u");
            sb.AppendLine();
            sb.AppendLine("/** Meta entries: H<index> for a VAR or the object itself, H<index>_<sub> for a sub entry */");
            foreach (Entry e in c.Entries)
                sb.AppendLine($"#define {c.EntryName(e)} {e.Id}u /* {Comment(e.Name)} */");
            sb.AppendLine();
            sb.AppendLine("/**");
            sb.AppendLine(" * Meta entry of an object dictionary entry (VAR or sub entry), following the");
            sb.AppendLine(" * meta addresses (CO_metaRef) of the object dictionary.");
            sb.AppendLine(" *");
            sb.AppendLine(" * @param index Object index.");
            sb.AppendLine(" * @param subIndex Sub-index, 0 for a VAR.");
            sb.AppendLine($" * @return Meta entry, or {P}_ID_NONE.");
            sb.AppendLine(" */");
            sb.AppendLine($"{p}_id_t {p}_find(uint16_t index, uint8_t subIndex);");
            sb.AppendLine();
            sb.AppendLine("/**");
            sb.AppendLine(" * Meta entry of an ARRAY or RECORD object itself (not of one of its sub entries).");
            sb.AppendLine(" *");
            sb.AppendLine(" * @param index Object index.");
            sb.AppendLine($" * @return Meta entry, or {P}_ID_NONE.");
            sb.AppendLine(" */");
            sb.AppendLine($"{p}_id_t {p}_find_object(uint16_t index);");
            sb.AppendLine();
            sb.AppendLine("/**");
            sb.AppendLine(" * Text of a meta entry in the selected language, or in the fallback language,");
            sb.AppendLine(" * if it is missing there. The text is constant and stays valid (UTF-8).");
            sb.AppendLine(" *");
            sb.AppendLine(" * @param id Meta entry.");
            sb.AppendLine(" * @param text Text kind.");
            sb.AppendLine(" * @return Text, or NULL, if there is none.");
            sb.AppendLine(" */");
            sb.AppendLine($"const char *{p}_text({p}_id_t id, {p}_text_t text);");
            sb.AppendLine();
            sb.AppendLine("/**");
            sb.AppendLine(" * Text of a meta entry in the given language, without fallback.");
            sb.AppendLine(" *");
            sb.AppendLine(" * @return Text, or NULL, if there is none.");
            sb.AppendLine(" */");
            sb.AppendLine($"const char *{p}_text_lang({p}_id_t id, {p}_text_t text, {p}_lang_t lang);");
            sb.AppendLine();
            sb.AppendLine("/**");
            sb.AppendLine(" * Text of a value (e.g. 0 = \"Off\") in the selected language, or in the");
            sb.AppendLine(" * fallback language, if it is missing there.");
            sb.AppendLine(" *");
            sb.AppendLine(" * @return Text, or NULL, if there is none.");
            sb.AppendLine(" */");
            sb.AppendLine($"const char *{p}_value_text({p}_id_t id, int32_t value);");
            sb.AppendLine();
            sb.AppendLine("/** Number of values with a text, e.g. for the options of a drop-down list */");
            sb.AppendLine($"uint16_t {p}_value_count({p}_id_t id);");
            sb.AppendLine();
            sb.AppendLine("/**");
            sb.AppendLine(" * Value with a text by position, sorted by value.");
            sb.AppendLine(" *");
            sb.AppendLine(" * @param id Meta entry.");
            sb.AppendLine($" * @param n Position, 0 .. {p}_value_count() - 1.");
            sb.AppendLine(" * @param [out] value The value, may be NULL.");
            sb.AppendLine(" * @return Text of the value (with fallback), or NULL, if n is out of range.");
            sb.AppendLine(" */");
            sb.AppendLine($"const char *{p}_value_at({p}_id_t id, uint16_t n, int32_t *value);");
            sb.AppendLine();
            sb.AppendLine("/** Multiplier from the raw value to the displayed value, 1.0f if none is set */");
            sb.AppendLine($"float {p}_multiplier({p}_id_t id);");
            sb.AppendLine();
            sb.AppendLine("/** Decimal places of the displayed value, taken from the multiplier (\"0.1\": 1), 0 if none is set */");
            sb.AppendLine($"uint8_t {p}_decimals({p}_id_t id);");
            sb.AppendLine();
            sb.AppendLine("/** Selects the language of the texts */");
            sb.AppendLine($"void {p}_set_language({p}_lang_t lang);");
            sb.AppendLine();
            sb.AppendLine("/** Selected language */");
            sb.AppendLine($"{p}_lang_t {p}_get_language(void);");
            sb.AppendLine();
            sb.AppendLine("/** Code of a language, e.g. \"de\", or NULL */");
            sb.AppendLine($"const char *{p}_language_code({p}_lang_t lang);");
            sb.AppendLine();
            sb.AppendLine("#ifdef __cplusplus");
            sb.AppendLine("}");
            sb.AppendLine("#endif");
            sb.AppendLine();
            sb.AppendLine($"#endif /* {guard} */");
            return sb.ToString();
        }

        private static string GenerateSource(Context c)
        {
            var sb = new StringBuilder();
            string p = c.Prefix, P = c.PREFIX, off = p + "_offset_t";
            int offSize = c.OffsetType == "uint16_t" ? 2 : 4;
            int flash = 0;

            sb.AppendLine("/*******************************************************************************");
            sb.AppendLine($"    Display texts (meta texts) - {c.BaseName}.c");
            sb.AppendLine();
            sb.AppendLine("    This file was automatically generated by EDSSharp (libedssharp), exporter");
            sb.AppendLine("    \"CanOpenNode Meta\". Do not edit, edit the meta project instead.");
            sb.AppendLine("    Format and usage: docs/meta-texts.md");
            sb.AppendLine("*******************************************************************************/");
            sb.AppendLine();
            sb.AppendLine($"#include <stddef.h>");
            sb.AppendLine($"#include \"{c.BaseName}.h\"");
            sb.AppendLine();
            sb.AppendLine($"/* Offset of a text in the string pool of its language, 0: no text */");
            sb.AppendLine($"typedef {c.OffsetType} {off};");
            sb.AppendLine();

            // string pools
            foreach (string lang in c.Languages)
            {
                Pool pool = c.Pools[lang];
                sb.AppendLine($"/* String pool \"{lang}\", {pool.Bytes.Count} bytes */");
                sb.AppendLine($"static const char {p}_pool_{CIdentifier(lang)}[] =");
                sb.AppendLine("    \"\\0\"");
                foreach (var s in pool.Strings)
                    sb.AppendLine($"    {CString(s.Value + "\0")} /* {s.Key}: {Comment(s.Value)} */");
                sb.AppendLine("    ;");
                sb.AppendLine();
                flash += pool.Bytes.Count;
            }
            sb.AppendLine($"static const char *const {p}_pool[{P}_LANG_COUNT] = {{ {string.Join(", ", c.Languages.Select(l => $"{p}_pool_{CIdentifier(l)}"))} }};");
            sb.AppendLine();
            sb.AppendLine($"static const char *const {p}_lang_code[{P}_LANG_COUNT] = {{ {string.Join(", ", c.Languages.Select(l => CString(l)))} }};");
            sb.AppendLine();

            // text tables
            sb.AppendLine("/* Text tables: dense (indexed by meta entry) or sparse (sorted meta entries) */");
            sb.AppendLine("typedef struct {");
            sb.AppendLine($"    const {p}_id_t *ids; /* NULL: dense table */");
            sb.AppendLine("    uint16_t count; /* number of ids of a sparse table */");
            sb.AppendLine($"    const {off} *offset[{P}_LANG_COUNT];");
            sb.AppendLine($"}} {p}_table_t;");
            sb.AppendLine();
            var tableInits = new List<string>();
            int n = c.Entries.Count;
            int L = c.Languages.Count;
            foreach (string kind in c.Kinds)
            {
                string k = CIdentifier(kind);
                var used = c.Entries.Where(e => c.Languages.Any(l => c.Offsets[kind][l][e.Id] != 0)).ToList();
                bool sparse = used.Count * 2 + used.Count * offSize * L < n * offSize * L;
                if (used.Count == 0)
                {
                    tableInits.Add($"    {{ NULL, 0, {{ {string.Join(", ", c.Languages.Select(l => "NULL"))} }} }}, /* {kind}: no texts */");
                    continue;
                }
                // a language without any text of this kind needs no table (the fallback applies)
                string Table(string lang) { return used.Any(e => c.Offsets[kind][lang][e.Id] != 0) ? $"{p}_{CIdentifier(lang)}_{k}" : "NULL"; }
                if (sparse)
                {
                    sb.AppendLine($"static const {p}_id_t {p}_{k}_id[{used.Count}] = {{ {string.Join(", ", used.Select(e => e.Id))} }};");
                    flash += used.Count * 2;
                    foreach (string lang in c.Languages.Where(l => Table(l) != "NULL"))
                    {
                        sb.AppendLine($"static const {off} {p}_{CIdentifier(lang)}_{k}[{used.Count}] = {{ {string.Join(", ", used.Select(e => c.Offsets[kind][lang][e.Id]))} }};");
                        flash += used.Count * offSize;
                    }
                    tableInits.Add($"    {{ {p}_{k}_id, {used.Count}, {{ {string.Join(", ", c.Languages.Select(Table))} }} }}, /* {kind} */");
                }
                else
                {
                    foreach (string lang in c.Languages.Where(l => Table(l) != "NULL"))
                    {
                        sb.AppendLine($"static const {off} {p}_{CIdentifier(lang)}_{k}[{P}_ENTRY_COUNT] = {{ {string.Join(", ", c.Entries.Select(e => c.Offsets[kind][lang][e.Id]))} }};");
                        flash += n * offSize;
                    }
                    tableInits.Add($"    {{ NULL, 0, {{ {string.Join(", ", c.Languages.Select(Table))} }} }}, /* {kind} */");
                }
            }
            sb.AppendLine();
            sb.AppendLine($"static const {p}_table_t {p}_table[{P}_TEXT_COUNT] = {{");
            foreach (string init in tableInits)
                sb.AppendLine(init);
            sb.AppendLine("};");
            sb.AppendLine();

            // OD mapping
            sb.AppendLine("/* Object dictionary address -> meta entry; key: index << 16 | sub-index (0x100: the object itself) */");
            sb.AppendLine($"#define {P}_OD_COUNT {c.Mapping.Count}u");
            if (c.Mapping.Count > 0)
            {
                sb.AppendLine($"static const uint32_t {p}_od_key[{P}_OD_COUNT] = {{");
                foreach (var chunk in Chunks(c.Mapping.Keys.Select(key => $"0x{key:X8}u"), 6))
                    sb.AppendLine("    " + string.Join(", ", chunk) + ",");
                sb.AppendLine("};");
                sb.AppendLine($"static const {p}_id_t {p}_od_id[{P}_OD_COUNT] = {{");
                foreach (var chunk in Chunks(c.Mapping.Values.Select(v => v.ToString(CultureInfo.InvariantCulture)), 16))
                    sb.AppendLine("    " + string.Join(", ", chunk) + ",");
                sb.AppendLine("};");
                flash += c.Mapping.Count * 6;
            }
            sb.AppendLine();

            // value lists
            int values = c.Lists.Sum(l => l.Values.Count);
            sb.AppendLine("/* Value texts: equal lists are stored once */");
            sb.AppendLine($"#define {P}_VL_ENTRY_COUNT {c.ListOfEntry.Count}u");
            if (c.ListOfEntry.Count > 0)
            {
                sb.AppendLine($"static const int32_t {p}_vl_value[{values}] = {{ {string.Join(", ", c.Lists.SelectMany(l => l.Values).Select(v => CInt32(v)))} }};");
                foreach (string lang in c.Languages)
                    sb.AppendLine($"static const {off} {p}_vl_{CIdentifier(lang)}[{values}] = {{ {string.Join(", ", c.Lists.SelectMany(l => l.Offsets[lang]))} }};");
                sb.AppendLine($"static const {off} *const {p}_vl_text[{P}_LANG_COUNT] = {{ {string.Join(", ", c.Languages.Select(l => $"{p}_vl_{CIdentifier(l)}"))} }};");
                sb.AppendLine($"static const uint16_t {p}_vl_start[{c.Lists.Count}] = {{ {string.Join(", ", c.Lists.Select(l => l.Start))} }};");
                sb.AppendLine($"static const uint16_t {p}_vl_count[{c.Lists.Count}] = {{ {string.Join(", ", c.Lists.Select(l => l.Values.Count))} }};");
                sb.AppendLine($"static const {p}_id_t {p}_vl_id[{P}_VL_ENTRY_COUNT] = {{ {string.Join(", ", c.ListOfEntry.Keys)} }};");
                sb.AppendLine($"static const uint16_t {p}_vl_list[{P}_VL_ENTRY_COUNT] = {{ {string.Join(", ", c.ListOfEntry.Values)} }};");
                flash += values * (4 + offSize * L) + c.Lists.Count * 4 + c.ListOfEntry.Count * 4;
            }
            sb.AppendLine();

            // multipliers
            sb.AppendLine("/* Multipliers and decimal places of the displayed value */");
            sb.AppendLine($"#define {P}_MUL_COUNT {c.Multipliers.Count}u");
            if (c.Multipliers.Count > 0)
            {
                sb.AppendLine($"static const {p}_id_t {p}_mul_id[{P}_MUL_COUNT] = {{ {string.Join(", ", c.Multipliers.Select(m => m.Key.Id))} }};");
                sb.AppendLine($"static const float {p}_mul_value[{P}_MUL_COUNT] = {{ {string.Join(", ", c.Multipliers.Select(m => CFloat(m.Value)))} }};");
                sb.AppendLine($"static const uint8_t {p}_mul_decimals[{P}_MUL_COUNT] = {{ {string.Join(", ", c.Multipliers.Select(m => Decimals(m.Value)))} }};");
                flash += c.Multipliers.Count * 7;
            }
            sb.AppendLine();

            sb.AppendLine($"static {p}_lang_t {p}_language = {P}_LANG_FALLBACK;");
            sb.AppendLine();

            // functions
            sb.AppendLine($"/* Position of id in a sorted list, or -1 */");
            sb.AppendLine($"static int32_t {p}_search_id(const {p}_id_t *ids, uint16_t count, {p}_id_t id) {{");
            sb.AppendLine("    int32_t lo = 0, hi = (int32_t)count - 1;");
            sb.AppendLine("    while (lo <= hi) {");
            sb.AppendLine("        int32_t mid = (lo + hi) / 2;");
            sb.AppendLine("        if (ids[mid] == id) return mid;");
            sb.AppendLine("        if (ids[mid] < id) lo = mid + 1; else hi = mid - 1;");
            sb.AppendLine("    }");
            sb.AppendLine("    return -1;");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine($"static {p}_id_t {p}_find_key(uint32_t key) {{");
            if (c.Mapping.Count > 0)
            {
                sb.AppendLine($"    int32_t lo = 0, hi = (int32_t){P}_OD_COUNT - 1;");
                sb.AppendLine("    while (lo <= hi) {");
                sb.AppendLine("        int32_t mid = (lo + hi) / 2;");
                sb.AppendLine($"        if ({p}_od_key[mid] == key) return {p}_od_id[mid];");
                sb.AppendLine($"        if ({p}_od_key[mid] < key) lo = mid + 1; else hi = mid - 1;");
                sb.AppendLine("    }");
            }
            else
            {
                sb.AppendLine("    (void)key;");
            }
            sb.AppendLine($"    return {P}_ID_NONE;");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine($"{p}_id_t {p}_find(uint16_t index, uint8_t subIndex) {{");
            sb.AppendLine($"    return {p}_find_key(((uint32_t)index << 16) | subIndex);");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine($"{p}_id_t {p}_find_object(uint16_t index) {{");
            sb.AppendLine($"    return {p}_find_key(((uint32_t)index << 16) | 0x100u);");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine($"const char *{p}_text_lang({p}_id_t id, {p}_text_t text, {p}_lang_t lang) {{");
            sb.AppendLine($"    const {p}_table_t *t;");
            sb.AppendLine($"    {off} o;");
            sb.AppendLine($"    if (id >= {P}_ENTRY_COUNT || (unsigned)text >= (unsigned){P}_TEXT_COUNT || (unsigned)lang >= (unsigned){P}_LANG_COUNT) return NULL;");
            sb.AppendLine($"    t = &{p}_table[text];");
            sb.AppendLine("    if (t->offset[lang] == NULL) return NULL;");
            sb.AppendLine("    if (t->ids != NULL) {");
            sb.AppendLine($"        int32_t pos = {p}_search_id(t->ids, t->count, id);");
            sb.AppendLine("        if (pos < 0) return NULL;");
            sb.AppendLine("        o = t->offset[lang][pos];");
            sb.AppendLine("    } else {");
            sb.AppendLine("        o = t->offset[lang][id];");
            sb.AppendLine("    }");
            sb.AppendLine($"    return o != 0 ? {p}_pool[lang] + o : NULL;");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine($"const char *{p}_text({p}_id_t id, {p}_text_t text) {{");
            sb.AppendLine($"    const char *s = {p}_text_lang(id, text, {p}_language);");
            sb.AppendLine($"    if (s == NULL && {p}_language != {P}_LANG_FALLBACK) s = {p}_text_lang(id, text, {P}_LANG_FALLBACK);");
            sb.AppendLine("    return s;");
            sb.AppendLine("}");
            sb.AppendLine();

            if (c.ListOfEntry.Count > 0)
            {
                sb.AppendLine($"static int32_t {p}_list(int32_t id) {{");
                sb.AppendLine($"    int32_t pos = (id >= 0 && id < (int32_t){P}_ENTRY_COUNT) ? {p}_search_id({p}_vl_id, {P}_VL_ENTRY_COUNT, ({p}_id_t)id) : -1;");
                sb.AppendLine($"    return pos < 0 ? -1 : (int32_t){p}_vl_list[pos];");
                sb.AppendLine("}");
                sb.AppendLine();
                sb.AppendLine($"static const char *{p}_value_pos(uint16_t pos) {{");
                sb.AppendLine($"    {off} o = {p}_vl_text[{p}_language][pos];");
                sb.AppendLine($"    if (o != 0) return {p}_pool[{p}_language] + o;");
                sb.AppendLine($"    o = {p}_vl_text[{P}_LANG_FALLBACK][pos];");
                sb.AppendLine($"    return o != 0 ? {p}_pool[{P}_LANG_FALLBACK] + o : NULL;");
                sb.AppendLine("}");
                sb.AppendLine();
                sb.AppendLine($"const char *{p}_value_text({p}_id_t id, int32_t value) {{");
                sb.AppendLine($"    int32_t list = {p}_list(id), lo, hi;");
                sb.AppendLine("    if (list < 0) return NULL;");
                sb.AppendLine($"    lo = {p}_vl_start[list];");
                sb.AppendLine($"    hi = lo + {p}_vl_count[list] - 1;");
                sb.AppendLine("    while (lo <= hi) {");
                sb.AppendLine("        int32_t mid = (lo + hi) / 2;");
                sb.AppendLine($"        if ({p}_vl_value[mid] == value) return {p}_value_pos((uint16_t)mid);");
                sb.AppendLine($"        if ({p}_vl_value[mid] < value) lo = mid + 1; else hi = mid - 1;");
                sb.AppendLine("    }");
                sb.AppendLine("    return NULL;");
                sb.AppendLine("}");
                sb.AppendLine();
                sb.AppendLine($"uint16_t {p}_value_count({p}_id_t id) {{");
                sb.AppendLine($"    int32_t list = {p}_list(id);");
                sb.AppendLine($"    return list < 0 ? 0 : {p}_vl_count[list];");
                sb.AppendLine("}");
                sb.AppendLine();
                sb.AppendLine($"const char *{p}_value_at({p}_id_t id, uint16_t n, int32_t *value) {{");
                sb.AppendLine($"    int32_t list = {p}_list(id);");
                sb.AppendLine($"    uint16_t pos;");
                sb.AppendLine($"    if (list < 0 || n >= {p}_vl_count[list]) return NULL;");
                sb.AppendLine($"    pos = (uint16_t)({p}_vl_start[list] + n);");
                sb.AppendLine($"    if (value != NULL) *value = {p}_vl_value[pos];");
                sb.AppendLine($"    return {p}_value_pos(pos);");
                sb.AppendLine("}");
            }
            else
            {
                sb.AppendLine($"const char *{p}_value_text({p}_id_t id, int32_t value) {{ (void)id; (void)value; return NULL; }}");
                sb.AppendLine();
                sb.AppendLine($"uint16_t {p}_value_count({p}_id_t id) {{ (void)id; return 0; }}");
                sb.AppendLine();
                sb.AppendLine($"const char *{p}_value_at({p}_id_t id, uint16_t n, int32_t *value) {{ (void)id; (void)n; (void)value; return NULL; }}");
            }
            sb.AppendLine();

            if (c.Multipliers.Count > 0)
            {
                sb.AppendLine($"float {p}_multiplier({p}_id_t id) {{");
                sb.AppendLine($"    int32_t pos = {p}_search_id({p}_mul_id, {P}_MUL_COUNT, id);");
                sb.AppendLine($"    return pos < 0 ? 1.0f : {p}_mul_value[pos];");
                sb.AppendLine("}");
                sb.AppendLine();
                sb.AppendLine($"uint8_t {p}_decimals({p}_id_t id) {{");
                sb.AppendLine($"    int32_t pos = {p}_search_id({p}_mul_id, {P}_MUL_COUNT, id);");
                sb.AppendLine($"    return pos < 0 ? 0 : {p}_mul_decimals[pos];");
                sb.AppendLine("}");
            }
            else
            {
                sb.AppendLine($"float {p}_multiplier({p}_id_t id) {{ (void)id; return 1.0f; }}");
                sb.AppendLine();
                sb.AppendLine($"uint8_t {p}_decimals({p}_id_t id) {{ (void)id; return 0; }}");
            }
            sb.AppendLine();
            sb.AppendLine($"void {p}_set_language({p}_lang_t lang) {{");
            sb.AppendLine($"    if ((unsigned)lang < (unsigned){P}_LANG_COUNT) {p}_language = lang;");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine($"{p}_lang_t {p}_get_language(void) {{");
            sb.AppendLine($"    return {p}_language;");
            sb.AppendLine("}");
            sb.AppendLine();
            sb.AppendLine($"const char *{p}_language_code({p}_lang_t lang) {{");
            sb.AppendLine($"    return (unsigned)lang < (unsigned){P}_LANG_COUNT ? {p}_lang_code[lang] : NULL;");
            sb.AppendLine("}");

            c.FlashEstimate = flash;
            return sb.ToString();
        }

        #endregion

        #region helpers

        /// <summary>
        /// Valid C identifier from a text: other characters become '_'
        /// </summary>
        public static string CIdentifier(string text)
        {
            var sb = new StringBuilder();
            foreach (char ch in text ?? "")
                sb.Append((ch < 128 && char.IsLetterOrDigit(ch)) ? ch : '_');
            if (sb.Length == 0 || char.IsDigit(sb[0]))
                sb.Insert(0, '_');
            return sb.ToString();
        }

        /// <summary>
        /// C string literal of a text, UTF-8, non-ASCII and control characters as octal escapes
        /// </summary>
        public static string CString(string text)
        {
            var sb = new StringBuilder("\"");
            foreach (byte b in Encoding.UTF8.GetBytes(text))
            {
                switch (b)
                {
                    case (byte)'"': sb.Append("\\\""); break;
                    case (byte)'\\': sb.Append("\\\\"); break;
                    case (byte)'?': sb.Append("\\?"); break; // no trigraphs
                    default:
                        if (b < 0x20 || b >= 0x7F)
                            sb.Append('\\').Append(Convert.ToString(b, 8).PadLeft(3, '0'));
                        else
                            sb.Append((char)b);
                        break;
                }
            }
            return sb.Append('"').ToString();
        }

        private static string Comment(string text)
        {
            text = (text ?? "").Replace("*/", "* /").Replace("/*", "/ *").Replace("\r", " ").Replace("\n", " ");
            return text.Length > 60 ? text.Substring(0, 57) + "..." : text;
        }

        private static string CInt32(long v)
        {
            return v == int.MinValue ? "INT32_MIN" : v.ToString(CultureInfo.InvariantCulture);
        }

        private static string CFloat(decimal v)
        {
            string s = ((double)v).ToString("R", CultureInfo.InvariantCulture);
            if (!s.Contains(".") && !s.Contains("E") && !s.Contains("e"))
                s += ".0";
            return s + "f";
        }

        private static int Decimals(decimal v)
        {
            int scale = (decimal.GetBits(v)[3] >> 16) & 0xFF;
            return Math.Min(scale, 255);
        }

        private static IEnumerable<List<string>> Chunks(IEnumerable<string> items, int size)
        {
            var chunk = new List<string>();
            foreach (string item in items)
            {
                chunk.Add(item);
                if (chunk.Count == size)
                {
                    yield return chunk;
                    chunk = new List<string>();
                }
            }
            if (chunk.Count > 0)
                yield return chunk;
        }

        private static string Glyphs(IEnumerable<Pool> pools)
        {
            var set = new SortedSet<int>();
            foreach (Pool pool in pools)
            {
                foreach (var s in pool.Strings)
                {
                    for (int i = 0; i < s.Value.Length; i += char.IsSurrogatePair(s.Value, i) ? 2 : 1)
                    {
                        int cp = char.ConvertToUtf32(s.Value, i);
                        if (cp >= 0x20)
                            set.Add(cp);
                    }
                }
            }
            return string.Concat(set.Select(char.ConvertFromUtf32)) + "\n";
        }

        #endregion
    }
}
