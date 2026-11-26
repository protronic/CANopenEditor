using EDSEditorGUI2.Mapper;
using LibCanOpen;

namespace GUITests
{
    public class MappingTests
    {
        [Fact]
        public void MappingFromProtobuffer()
        {
            // testing for exception in the mapping assert.
            var sut = new CanOpenDevice();
            ProtobufferViewModelMapper.MapFromProtobuffer(sut);
        }

        [Fact]
        public void MappingFromProtobuffer_KeepsDisplayTexts()
        {
            var obj = new OdObject { Name = "Boiler temperature", ObjectType = OdObject.Types.ObjectType.Var };
            obj.Meta = new OdMetaTexts { MetaRef = "0x2000", Multiplier = "0.1" };
            obj.Meta.Texts["label:de"] = "Kesseltemp.";
            obj.Meta.TextExport.Add("tooltip");
            var sub = new OdSubObject { Name = "Boiler temperature" };
            sub.Meta = new OdMetaTexts { Multiplier = "0.5" };
            sub.Meta.Texts["unit:de"] = "°C";
            obj.SubObjects.Add("00", sub);
            var sut = new CanOpenDevice();
            sut.Objects.Add("2100", obj);

            var device = ProtobufferViewModelMapper.MapFromProtobuffer(sut);

            var mapped = device.Objects["2100"];
            Assert.Equal("Kesseltemp.", mapped.Meta!.Texts["label:de"]);
            Assert.Equal("0x2000", mapped.Meta.MetaRef);
            Assert.Equal("0.1", mapped.Meta.Multiplier);
            Assert.Equal(new[] { "tooltip" }, mapped.Meta.TextExport);
            Assert.NotSame(obj.Meta, mapped.Meta);
            var mappedSub = mapped.SubObjects.Single(s => s.Key == "00").Value;
            Assert.Equal("°C", mappedSub.Meta!.Texts["unit:de"]);
            Assert.Equal("0.5", mappedSub.Meta.Multiplier);

            // and back: the view model keeps the texts for saving
            var back = new ProtobufferViewModelMapper.ODConverter().Convert(device.Objects, new Google.Protobuf.Collections.MapField<string, OdObject>(), null!);
            Assert.Equal("Kesseltemp.", back["2100"].Meta.Texts["label:de"]);
        }
    }
}
