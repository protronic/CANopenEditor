using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using libEDSsharp;
using Xunit;

namespace Tests
{
    /// <summary>
    /// Display texts (meta texts) survive XDD, protobuf JSON and the EDSsharp/protobuf mapping, see docs/meta-texts.md
    /// </summary>
    public sealed class MetaTextsTests : IDisposable
    {
        private readonly string folder = Path.Combine(Path.GetTempPath(), "meta-texts-" + Guid.NewGuid().ToString("N"));

        public MetaTextsTests()
        {
            Directory.CreateDirectory(folder);
        }

        public void Dispose()
        {
            Directory.Delete(folder, true);
        }

        /// <summary>VAR 0x2100 with texts and multiplier, ARRAY 0x2110 with object and sub entry texts</summary>
        internal static EDSsharp Model()
        {
            var eds = new EDSsharp();
            eds.ods.Clear();
            eds.di.ProductName = "Meta test";

            var temp = new ODentry("Boiler temperature", 0x2100, DataType.INTEGER16, "0", EDSsharp.AccessType.ro, PDOMappingType.optional);
            temp.prop.CO_texts["label:de"] = "Kesseltemp.";
            temp.prop.CO_texts["label:en"] = "Boiler temp.";
            temp.prop.CO_texts["tooltip:de"] = "Aktuelle Temperatur im Kessel";
            temp.prop.CO_texts["unit:de"] = "°C";
            temp.prop.CO_textExport.Add("tooltip");
            temp.prop.CO_multiplier = "0.1";
            eds.ods.Add(0x2100, temp);

            var mode = new ODentry("Operating mode", 0x2200, DataType.UNSIGNED8, "0", EDSsharp.AccessType.rw, PDOMappingType.no);
            mode.prop.CO_texts["label:de"] = "Betriebsart";
            mode.prop.CO_texts["value.0:de"] = "Aus";
            mode.prop.CO_texts["value.1:de"] = "Ein";
            mode.prop.CO_texts["value.1:en"] = "On";
            eds.ods.Add(0x2200, mode);

            var inputs = new ODentry { parameter_name = "Analog inputs", Index = 0x2110, objecttype = ObjectType.ARRAY, datatype = DataType.INTEGER16, accesstype = EDSsharp.AccessType.ro };
            inputs.prop.CO_texts["label:de"] = "Analogeingänge";
            inputs.prop.CO_metaRef = "0x2111";
            inputs.addsubobject(0, new ODentry("Highest sub-index supported", 0x2110, DataType.UNSIGNED8, "0x02", EDSsharp.AccessType.ro, PDOMappingType.no, inputs));
            var in1 = new ODentry("Input 1", 0x2110, DataType.INTEGER16, "0", EDSsharp.AccessType.ro, PDOMappingType.optional, inputs);
            in1.prop.CO_texts["label:de"] = "Eingang 1";
            in1.prop.CO_texts["description:de"] = "Erster Eingang,\nmit Zeilenumbruch & <Sonderzeichen>";
            in1.prop.CO_multiplier = "0.01";
            inputs.addsubobject(1, in1);
            var in2 = new ODentry("Input 2", 0x2110, DataType.INTEGER16, "0", EDSsharp.AccessType.ro, PDOMappingType.optional, inputs);
            in2.prop.CO_metaRef = "0x2110:01";
            inputs.addsubobject(2, in2);
            eds.ods.Add(0x2110, inputs);

            eds.textInfo.Languages.AddRange(new[] { "de", "en" });
            eds.textInfo.FallbackLanguage = "de";
            eds.textInfo.MaxLength["label"] = 16;
            eds.textInfo.MaxLength["tooltip"] = 128;
            eds.textInfo.MetaProject = true;
            eds.textInfo.MetaSource = "device.xdd";
            return eds;
        }

        private static void AssertTexts(EDSsharp eds)
        {
            ODentry temp = eds.ods[0x2100];
            Assert.Equal("Kesseltemp.", temp.prop.CO_texts["label:de"]);
            Assert.Equal("Boiler temp.", temp.prop.CO_texts["label:en"]);
            Assert.Equal("Aktuelle Temperatur im Kessel", temp.prop.CO_texts["tooltip:de"]);
            Assert.Equal("°C", temp.prop.CO_texts["unit:de"]);
            Assert.Equal(new[] { "tooltip" }, temp.prop.CO_textExport);
            Assert.Equal("0.1", temp.prop.CO_multiplier);
            Assert.Equal(4, temp.prop.CO_texts.Count);

            ODentry mode = eds.ods[0x2200];
            Assert.Equal("Aus", mode.prop.CO_texts["value.0:de"]);
            Assert.Equal("On", mode.prop.CO_texts["value.1:en"]);

            ODentry inputs = eds.ods[0x2110];
            Assert.Equal("Analogeingänge", inputs.prop.CO_texts["label:de"]);
            Assert.Equal("0x2111", inputs.prop.CO_metaRef);
            Assert.Equal("Eingang 1", inputs.subobjects[1].prop.CO_texts["label:de"]);
            Assert.Equal("Erster Eingang,\nmit Zeilenumbruch & <Sonderzeichen>", inputs.subobjects[1].prop.CO_texts["description:de"]);
            Assert.Equal("0.01", inputs.subobjects[1].prop.CO_multiplier);
            Assert.Equal("0x2110:01", inputs.subobjects[2].prop.CO_metaRef);
            Assert.Empty(inputs.subobjects[0].prop.CO_texts);

            Assert.Equal(new[] { "de", "en" }, eds.textInfo.Languages);
            Assert.Equal("de", eds.textInfo.FallbackLanguage);
            Assert.Equal(16u, eds.textInfo.MaxLength["label"]);
            Assert.Equal(128u, eds.textInfo.MaxLength["tooltip"]);
            Assert.True(eds.textInfo.MetaProject);
            Assert.Equal("device.xdd", eds.textInfo.MetaSource);
        }

        [Fact]
        public void Xdd_RoundTrip_KeepsTexts()
        {
            string path = Path.Combine(folder, "meta.xdd");
            new CanOpenXDD_1_1().WriteXML(path, Model(), false, false);

            string xml = File.ReadAllText(path);
            Assert.Contains("name=\"CO_text:label:de\" value=\"Kesseltemp.\"", xml);
            Assert.Contains("name=\"CO_multiplier\" value=\"0.1\"", xml);
            Assert.Contains("CO_textLanguages", xml);

            EDSsharp loaded = XddLoader.Load(path);
            AssertTexts(loaded);

            // saving the loaded file again does not duplicate the project settings
            string path2 = Path.Combine(folder, "meta2.xdd");
            new CanOpenXDD_1_1().WriteXML(path2, loaded, false, false);
            string xml2 = File.ReadAllText(path2);
            Assert.Equal(1, CountOf(xml2, "CO_textLanguages"));
            AssertTexts(XddLoader.Load(path2));
        }

        [Fact]
        public void Json_RoundTrip_KeepsTexts()
        {
            string path = Path.Combine(folder, "meta.json");
            new CanOpenXDD_1_1().WriteProtobuf(path, Model(), true);

            string json = File.ReadAllText(path);
            Assert.Contains("\"label:de\": \"Kesseltemp.\"", json);
            Assert.Contains("\"multiplier\": \"0.1\"", json);
            Assert.Contains("\"textInfo\"", json);

            EDSsharp loaded = new CanOpenXDD_1_1().ReadProtobuf(path, true);
            AssertTexts(loaded);
        }

        [Fact]
        public void Mapping_RoundTrip_KeepsTexts()
        {
            var proto = MappingEDS.MapToProtobuffer(Model());
            Assert.Equal("Kesseltemp.", proto.Objects[0x2100.ToString()].Meta.Texts["label:de"]);
            Assert.Equal("0.01", proto.Objects[0x2110.ToString()].SubObjects["1"].Meta.Multiplier);
            Assert.Null(proto.Objects[0x2110.ToString()].SubObjects["0"].Meta);
            Assert.Equal("de", proto.TextInfo.FallbackLanguage);

            EDSsharp back = MappingEDS.MapFromProtobuffer(proto);
            AssertTexts(back);
        }

        [Fact]
        public void FileWithoutTexts_IsWrittenAsBefore()
        {
            var eds = Model();
            foreach (ODentry od in eds.ods.Values)
            {
                od.prop.CO_texts.Clear();
                od.prop.CO_metaRef = "";
                od.prop.CO_textExport.Clear();
                od.prop.CO_multiplier = "";
                foreach (ODentry sub in od.subobjects.Values)
                {
                    sub.prop.CO_texts.Clear();
                    sub.prop.CO_metaRef = "";
                    sub.prop.CO_multiplier = "";
                }
            }
            eds.textInfo = new MetaTextInfo();

            string xddPath = Path.Combine(folder, "plain.xdd");
            new CanOpenXDD_1_1().WriteXML(xddPath, eds, false, false);
            string xml = File.ReadAllText(xddPath);
            Assert.DoesNotContain("CO_text", xml);
            Assert.DoesNotContain("CO_meta", xml);
            Assert.DoesNotContain("CO_multiplier", xml);

            string jsonPath = Path.Combine(folder, "plain.json");
            new CanOpenXDD_1_1().WriteProtobuf(jsonPath, eds, true);
            string json = File.ReadAllText(jsonPath);
            Assert.DoesNotContain("textInfo", json);
            Assert.DoesNotContain("\"meta\"", json);
        }

        [Fact]
        public void Clone_CopiesTexts()
        {
            ODentry original = Model().ods[0x2100];
            ODentry copy = original.Clone();
            copy.prop.CO_texts["label:de"] = "geändert";
            copy.prop.CO_textExport.Clear();
            Assert.Equal("Kesseltemp.", original.prop.CO_texts["label:de"]);
            Assert.Equal(new[] { "tooltip" }, original.prop.CO_textExport);
            Assert.Equal("0.1", copy.prop.CO_multiplier);
        }

        [Theory]
        [InlineData("0x1400", 0x1400, -1)]
        [InlineData("1400", 0x1400, -1)]
        [InlineData("0x1400:01", 0x1400, 1)]
        [InlineData("2110:1f", 0x2110, 0x1f)]
        [InlineData(" 0X2000 : 0x02 ", 0x2000, 2)]
        public void MetaAddress_Parses(string text, int index, int sub)
        {
            Assert.True(MetaAddress.TryParse(text, out MetaAddress address));
            Assert.Equal(index, address.Index);
            Assert.Equal(sub < 0 ? (byte?)null : (byte)sub, address.SubIndex);
        }

        [Theory]
        [InlineData("")]
        [InlineData("0x12345")]
        [InlineData("0x1400:100")]
        [InlineData("label")]
        public void MetaAddress_RejectsInvalid(string text)
        {
            Assert.False(MetaAddress.TryParse(text, out _));
        }

        [Theory]
        [InlineData("value.0", 0)]
        [InlineData("value.-5", -5)]
        [InlineData("value.0x10", 16)]
        public void ValueKind_Parses(string kind, long value)
        {
            Assert.True(MetaTexts.TryParseValueKind(kind, out long parsed));
            Assert.Equal(value, parsed);
        }

        private static int CountOf(string text, string part)
        {
            int count = 0;
            for (int i = text.IndexOf(part, StringComparison.Ordinal); i >= 0; i = text.IndexOf(part, i + part.Length, StringComparison.Ordinal))
                count++;
            return count;
        }
    }
}
