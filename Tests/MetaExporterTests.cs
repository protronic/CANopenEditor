using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using libEDSsharp;
using Xunit;

namespace Tests
{
    /// <summary>
    /// The "CanOpenNode Meta" exporter (meta.c / meta.h): generated code compiles warning-free and
    /// returns every text, value text and multiplier of the project, see docs/meta-texts.md
    /// </summary>
    public sealed class MetaExporterTests : IDisposable
    {
        private readonly string folder = Path.Combine(Path.GetTempPath(), "meta-export-" + Guid.NewGuid().ToString("N"));

        public MetaExporterTests()
        {
            Directory.CreateDirectory(folder);
        }

        public void Dispose()
        {
            Directory.Delete(folder, true);
        }

        /// <summary>Object dictionary using the meta project: 0x2101 shares the texts of 0x2100, 0x2120 those of the array 0x2110</summary>
        private static EDSsharp SourceOd()
        {
            EDSsharp od = MetaTextsTests.Model();
            foreach (ODentry e in od.ods.Values)
            {
                e.prop.CO_texts.Clear();
                e.prop.CO_metaRef = "";
                foreach (ODentry sub in e.subobjects.Values)
                {
                    sub.prop.CO_texts.Clear();
                    sub.prop.CO_metaRef = "";
                }
            }
            od.textInfo = new MetaTextInfo();
            od.ods.Add(0x2101, new ODentry("Boiler temperature 2", 0x2101, DataType.INTEGER16, "0", EDSsharp.AccessType.ro, PDOMappingType.optional));
            od.ods[0x2101].prop.CO_metaRef = "0x2100";

            var copy = od.ods[0x2110].Clone();
            copy.Index = 0x2120;
            copy.prop.CO_metaRef = "0x2110";
            od.ods.Add(0x2120, copy);
            return od;
        }

        private static EDSsharp MetaProject()
        {
            EDSsharp meta = MetaTextsTests.Model();
            meta.ods[0x2110].prop.CO_metaRef = ""; // in the meta project the texts are used directly
            meta.ods[0x2110].subobjects[2].prop.CO_metaRef = "";
            meta.ods[0x2110].subobjects[2].prop.CO_texts["label:de"] = "Eingang 2";
            meta.ods[0x2110].subobjects[2].prop.CO_texts["label:en"] = "Input 2";
            meta.ods[0x2200].prop.CO_texts["value.-1:de"] = "Fehler";
            // same value list as 0x2200: stored only once
            var mode2 = new ODentry("Operating mode 2", 0x2201, DataType.UNSIGNED8, "0", EDSsharp.AccessType.rw, PDOMappingType.no);
            foreach (var t in meta.ods[0x2200].prop.CO_texts.Where(t => t.Key.StartsWith("value.")))
                mode2.prop.CO_texts[t.Key] = t.Value;
            meta.ods.Add(0x2201, mode2);
            return meta;
        }

        [Fact]
        public void Export_WritesHeaderAndSource()
        {
            var exporter = new CanOpenNodeMetaExporter { SourceOd = SourceOd(), GlyphFile = Path.Combine(folder, "glyphs.txt") };
            exporter.Export(Path.Combine(folder, "meta.c"), MetaProject());

            string h = File.ReadAllText(Path.Combine(folder, "meta.h"));
            string c = File.ReadAllText(Path.Combine(folder, "meta.c"));
            Assert.Contains("META_LANG_DE = 0", h);
            Assert.Contains("META_LANG_EN = 1", h);
            Assert.Contains("#define META_LANG_FALLBACK META_LANG_DE", h);
            Assert.Contains("#define META_H2100 ", h);
            Assert.Contains("#define META_H2110 ", h);
            Assert.Contains("#define META_H2110_01 ", h);
            Assert.Contains("meta_id_t meta_find(uint16_t index, uint8_t subIndex);", h);
            Assert.DoesNotContain("Erster Eingang", c); // descriptions are not exported
            Assert.Contains("Kesseltemp.", c);

            string glyphs = File.ReadAllText(Path.Combine(folder, "glyphs.txt"));
            Assert.Contains("°", glyphs);
            Assert.Contains("ä", glyphs);
            Assert.Equal(glyphs.TrimEnd('\n').Distinct().Count(), glyphs.TrimEnd('\n').Length);
        }

        [Fact]
        public void Export_SomeLanguages_KeepsFallbackTexts()
        {
            // only English: German texts (the fallback) stand in where English is missing, e.g. the unit
            var exporter = new CanOpenNodeMetaExporter { SourceOd = SourceOd(), Languages = new[] { "en" }, GlyphFile = Path.Combine(folder, "sub", "glyphs.txt") };
            Directory.CreateDirectory(Path.Combine(folder, "sub"));
            exporter.Export(Path.Combine(folder, "out", "meta.c"), MetaProject());

            string h = File.ReadAllText(Path.Combine(folder, "out", "meta.h"));
            string c = File.ReadAllText(Path.Combine(folder, "out", "meta.c"));
            Assert.Contains("META_LANG_EN = 0", h);
            Assert.DoesNotContain("META_LANG_DE", h);
            Assert.Contains("Boiler temp.", c);       // own English label
            Assert.Contains("\\302\\260C", c);        // unit "°C" only exists in German
            Assert.Contains("Fehler", c);             // value text only in German
            Assert.DoesNotContain("Kesseltemp.", c);  // German label not needed, English exists
        }

        [Fact]
        public void Export_WarnsAboutTooLongTextsAndMissingAddresses()
        {
            EDSsharp meta = MetaProject();
            meta.ods[0x2100].prop.CO_texts["label:en"] = "A label that is much too long";
            EDSsharp od = SourceOd();
            od.ods[0x2101].prop.CO_metaRef = "0x2999";
            var exporter = new CanOpenNodeMetaExporter { SourceOd = od };
            exporter.Export(Path.Combine(folder, "meta"), meta);
            Assert.Contains(exporter.Messages, m => m.Contains("label:en") && m.Contains("more than 16"));
            Assert.Contains(exporter.Messages, m => m.Contains("0x2999") && m.Contains("does not exist"));
        }

        [Fact]
        public void GeneratedCode_CompilesAndReturnsAllTexts()
        {
            string gcc = FindCompiler();
            if (gcc == null)
                return; // no C compiler on this machine, e.g. Windows without MinGW

            var exporter = new CanOpenNodeMetaExporter { SourceOd = SourceOd() };
            exporter.Export(Path.Combine(folder, "meta.c"), MetaProject());

            File.WriteAllText(Path.Combine(folder, "main.c"), @"
#include <stdio.h>
#include ""meta.h""
static const char *s(const char *t) { return t ? t : ""(null)""; }
static void entry(const char *name, meta_id_t id) {
    int32_t v; uint16_t i;
    printf(""%s label=%s unit=%s tooltip=%s mul=%g dec=%u"", name,
        s(meta_text(id, META_TEXT_LABEL)), s(meta_text(id, META_TEXT_UNIT)), s(meta_text(id, META_TEXT_TOOLTIP)),
        (double)meta_multiplier(id), (unsigned)meta_decimals(id));
    for (i = 0; i < meta_value_count(id); i++) { const char *t = meta_value_at(id, i, &v); printf("" %ld=%s"", (long)v, s(t)); }
    printf(""\n"");
}
int main(void) {
    int l;
    for (l = 0; l < META_LANG_COUNT; l++) {
        meta_set_language((meta_lang_t)l);
        printf(""[%s]\n"", meta_language_code(meta_get_language()));
        entry(""2100"", meta_find(0x2100, 0));
        entry(""2101"", meta_find(0x2101, 0));
        entry(""2110"", meta_find_object(0x2110));
        entry(""2110:01"", meta_find(0x2110, 1));
        entry(""2120"", meta_find_object(0x2120));
        entry(""2120:02"", meta_find(0x2120, 2));
        entry(""2200"", meta_find(0x2200, 0));
        printf(""2200 value 1=%s value 7=%s\n"", s(meta_value_text(meta_find(0x2200, 0), 1)), s(meta_value_text(meta_find(0x2200, 0), 7)));
        printf(""none=%u\n"", (unsigned)meta_find(0x1000, 0));
    }
    printf(""de label 2100 without fallback in en: %s\n"", s(meta_text_lang(META_H2100, META_TEXT_UNIT, META_LANG_EN)));
    return 0;
}
");
            string exe = Path.Combine(folder, RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "meta-test.exe" : "meta-test");
            Run(gcc, $"-std=c99 -Wall -Wextra -Werror -pedantic -o \"{exe}\" \"{Path.Combine(folder, "main.c")}\" \"{Path.Combine(folder, "meta.c")}\"");
            Run(gcc, $"-x c++ -std=c++17 -Wall -Wextra -Werror -c -o \"{Path.Combine(folder, "meta-cpp.o")}\" \"{Path.Combine(folder, "meta.c")}\"");
            string output = Run(exe, "");

            string expected = @"[de]
2100 label=Kesseltemp. unit=°C tooltip=Aktuelle Temperatur im Kessel mul=0.1 dec=1
2101 label=Kesseltemp. unit=°C tooltip=Aktuelle Temperatur im Kessel mul=0.1 dec=1
2110 label=Analogeingänge unit=(null) tooltip=(null) mul=1 dec=0
2110:01 label=Eingang 1 unit=(null) tooltip=(null) mul=0.01 dec=2
2120 label=Analogeingänge unit=(null) tooltip=(null) mul=1 dec=0
2120:02 label=Eingang 2 unit=(null) tooltip=(null) mul=1 dec=0
2200 label=Betriebsart unit=(null) tooltip=(null) mul=1 dec=0 -1=Fehler 0=Aus 1=Ein
2200 value 1=Ein value 7=(null)
none=65535
[en]
2100 label=Boiler temp. unit=°C tooltip=Aktuelle Temperatur im Kessel mul=0.1 dec=1
2101 label=Boiler temp. unit=°C tooltip=Aktuelle Temperatur im Kessel mul=0.1 dec=1
2110 label=Analogeingänge unit=(null) tooltip=(null) mul=1 dec=0
2110:01 label=Eingang 1 unit=(null) tooltip=(null) mul=0.01 dec=2
2120 label=Analogeingänge unit=(null) tooltip=(null) mul=1 dec=0
2120:02 label=Input 2 unit=(null) tooltip=(null) mul=1 dec=0
2200 label=Betriebsart unit=(null) tooltip=(null) mul=1 dec=0 -1=Fehler 0=Aus 1=On
2200 value 1=On value 7=(null)
none=65535
de label 2100 without fallback in en: (null)
";
            Assert.Equal(expected.Replace("\r\n", "\n"), output.Replace("\r\n", "\n"));

            // equal value lists are stored once
            string c = File.ReadAllText(Path.Combine(folder, "meta.c"));
            Assert.Contains("static const uint16_t meta_vl_count[1]", c);
        }

        private static string FindCompiler()
        {
            foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            {
                foreach (string name in new[] { "gcc", "gcc.exe" })
                {
                    try
                    {
                        string path = Path.Combine(dir, name);
                        if (File.Exists(path))
                            return path;
                    }
                    catch (ArgumentException)
                    {
                    }
                }
            }
            return null;
        }

        private static string Run(string file, string args)
        {
            var psi = new ProcessStartInfo(file, args)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                StandardOutputEncoding = Encoding.UTF8
            };
            using (Process p = Process.Start(psi))
            {
                string stdout = p.StandardOutput.ReadToEnd();
                string stderr = p.StandardError.ReadToEnd();
                p.WaitForExit();
                Assert.True(p.ExitCode == 0, $"{Path.GetFileName(file)} failed:\n{stderr}\n{stdout}");
                return stdout;
            }
        }
    }
}
