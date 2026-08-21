using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using Xunit;

namespace Tests
{
    public class CliTest : libEDSsharp.EDSsharp
    {
        string RunEDSSharp(string arguments)
        {
            foreach (string file in new[] { "Legacy.c", "Legacy.h", "V4.c", "V4.h", "file.eds", "file.xpd",
                "export_out/minimal_project.c", "export_out/minimal_project.h", "export_out/minimal_project.json" })
            {
                if (File.Exists(file))
                {
                    File.Delete(file);
                }
            }
            if (Directory.Exists("export_out"))
            {
                Directory.Delete("export_out");
            }

            Process p = new Process();
            p.StartInfo.UseShellExecute = false;
            p.StartInfo.RedirectStandardOutput = true;
            // Auf Windows heisst der Apphost EDSSharp.exe, auf Linux/macOS EDSSharp;
            // ausserhalb von Windows wird das Arbeitsverzeichnis zudem nicht
            // automatisch durchsucht, daher expliziter relativer Pfad.
            p.StartInfo.FileName = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
                ? "EDSSharp.exe"
                : Path.Combine(".", "EDSSharp");
            p.StartInfo.Arguments = arguments;
            p.Start();
            string output = p.StandardOutput.ReadToEnd();
            p.WaitForExit();
            return output;
        }

        [Fact]
        public void XddToCanOpenNodeLegacy()
        {
            RunEDSSharp("--type CanOpenNode --infile minimal_project.xdd --outfile Legacy");
            string[] files = Directory.GetFiles(".", "Legacy.*");
            Assert.Equal(2, files.Length);
        }
        [Fact]
        public void XddToCanOpenNodeV4()
        {
            RunEDSSharp("--type CanOpenNodeV4 --infile minimal_project.xdd --outfile V4");
            string[] files = Directory.GetFiles(".", "V4.*");
            Assert.Equal(2, files.Length);
        }
        [Fact]
        public void OnlySingleExporterByExtensionPossible()
        {
            RunEDSSharp("--infile minimal_project.xdd --outfile file.eds");
            string[] files = Directory.GetFiles(".", "file.eds");
            Assert.Single(files);
        }
        [Fact]
        public void MultipleExporterByExtensionPossibleWithoutType()
        {
            //this should fail
            RunEDSSharp("--infile minimal_project.xdd --outfile file.xdd");
            string[] files = Directory.GetFiles(".", "file.xdd");
            Assert.Empty(files);
        }
        [Fact]
        public void MultipleExporterByExtensionPossibleWithType()
        {
            RunEDSSharp("--type CanOpenXDDv1.1 --infile minimal_project.xdd --outfile file.nxdd");
            string[] files = Directory.GetFiles(".", "file.nxdd");
            Assert.Single(files);
        }
        [Fact]
        public void ExportProjectToCanOpenNodeAndJson()
        {
            RunEDSSharp("--export-project --infile minimal_project.xdd --outdir export_out");
            Assert.True(File.Exists("export_out/minimal_project.h"));
            Assert.True(File.Exists("export_out/minimal_project.c"));
            Assert.True(File.Exists("export_out/minimal_project.json"));

            // Symbols use the GUI-style "OD" prefix even though the files are
            // named after the project; --odname overrides it.
            Assert.Contains("#define OD_H", File.ReadAllText("export_out/minimal_project.h"));
        }

        [Fact]
        public void ExportProjectWithCustomOdName()
        {
            RunEDSSharp("--export-project --infile minimal_project.xdd --outdir export_out --odname MYOD");
            Assert.Contains("#define MYOD_H", File.ReadAllText("export_out/minimal_project.h"));
        }
    }
}
