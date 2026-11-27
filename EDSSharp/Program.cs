using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using libEDSsharp;

namespace EDSSharp
{
    class Program
    {
        static libEDSsharp.EDSsharp eds = new EDSsharp();

        static void Main(string[] args)
        {
            try
            {
                Dictionary<string, string> argskvp = ParseArgs(args);

                if (argskvp.ContainsKey("--export-project"))
                {
                    ExportProject(argskvp);
                    return;
                }

                if (argskvp.ContainsKey("--infile") && argskvp.ContainsKey("--outfile"))
                {
                    string infile = argskvp["--infile"];
                    string outfile = argskvp["--outfile"];
                    string outtype = "";
                    if (argskvp.ContainsKey("--type"))
                    {
                        outtype = argskvp["--type"];
                    }

                    eds = LoadProject(infile);
                    if (eds != null)
                    {
                        if (outtype == "CanOpenNodeMeta")
                            ExportMeta(outfile, argskvp);
                        else
                            Export(outfile, outtype);
                        Console.WriteLine("Successful conversion");
                    }
                    else
                    {
                        Program.WriteError("Invalid INFILE.");
                        PrintHelpText();
                    }
                }
                else
                {
                    Program.WriteError("INFILE or OUTFILE missing.");
                    PrintHelpText();
                }
            }
            catch(Exception e)
            {
                Console.WriteLine(e.ToString());
                Console.WriteLine("");
                Program.WriteError("Invalid EDS INFILE.");
                PrintHelpText();
            }
        }

        private static Dictionary<string, string> ParseArgs(string[] args)
        {
            Dictionary<string, string> argskvp = new Dictionary<string, string>();

            for (int argv = 0; argv < args.Length; argv++)
            {
                if (!args[argv].StartsWith("--"))
                {
                    continue;
                }

                if (args[argv] == "--export-project")
                {
                    argskvp.Add("--export-project", "true");
                    continue;
                }

                if (argv + 1 >= args.Length || args[argv + 1].StartsWith("--"))
                {
                    continue;
                }

                argskvp.Add(args[argv], args[++argv]);
            }

            return argskvp;
        }

        private static void ExportProject(Dictionary<string, string> argskvp)
        {
            if (!argskvp.ContainsKey("--infile") || !argskvp.ContainsKey("--outdir"))
            {
                Program.WriteError("INFILE or OUTDIR missing.");
                PrintExportProjectHelpText();
                return;
            }

            string infile = Path.GetFullPath(argskvp["--infile"]);
            string outdir = Path.GetFullPath(argskvp["--outdir"]);
            Directory.CreateDirectory(outdir);

            eds = LoadProject(infile);
            if (eds == null)
            {
                Program.WriteError("Invalid project INFILE.");
                PrintExportProjectHelpText();
                return;
            }

            eds.fi.exportFolder = outdir;

            string basename = argskvp.ContainsKey("--od")
                ? argskvp["--od"]
                : Path.GetFileNameWithoutExtension(infile);

            string canopennodeVersion = "v4";
            if (argskvp.ContainsKey("--canopennode"))
            {
                canopennodeVersion = argskvp["--canopennode"].ToLower();
            }

            if (canopennodeVersion != "v4" && canopennodeVersion != "legacy")
            {
                Program.WriteError("Invalid --canopennode value. Use 'v4' or 'legacy'.");
                PrintExportProjectHelpText();
                return;
            }

            ExporterFactory.Exporter cnType = canopennodeVersion == "legacy"
                ? ExporterFactory.Exporter.CANOPENNODE_LEGACY
                : ExporterFactory.Exporter.CANOPENNODE_V4;

            string odBasePath = Path.Combine(outdir, basename);
            string jsonPath = argskvp.ContainsKey("--json")
                ? Path.GetFullPath(argskvp["--json"])
                : Path.Combine(outdir, basename + ".json");

            Directory.CreateDirectory(Path.GetDirectoryName(jsonPath));

            Warnings.warning_list.Clear();

            if (eds.textInfo.MetaProject)
            {
                // Meta project: display texts as meta.c/meta.h instead of OD.c/OD.h
                string metaBase = argskvp.ContainsKey("--od") ? argskvp["--od"] : "meta";
                ExportMeta(Path.Combine(outdir, metaBase), argskvp);
                Export(argskvp.ContainsKey("--json") ? jsonPath : Path.Combine(outdir, metaBase + ".json"), "CanOpenNodeProtobuf(json)");
                Console.WriteLine("Successful export");
                return;
            }

            if (cnType == ExporterFactory.Exporter.CANOPENNODE_V4)
            {
                // Symbolpraefix im generierten C/H-Code: standardmaessig "OD" wie
                // beim GUI-Export nach OD.c/OD.h (die Dateien heissen weiterhin
                // nach --od); per --odname uebersteuerbar.
                string odname = argskvp.ContainsKey("--odname") ? argskvp["--odname"] : "OD";
                new CanOpenNodeExporter_V4().export(odBasePath, eds, odname);
            }
            else
            {
                ExporterFactory.getExporter(cnType).export(odBasePath, eds);
            }
            Export(jsonPath, "CanOpenNodeProtobuf(json)");

            // Texts stored directly in the object dictionary: meta.c/meta.h in addition
            if (HasTexts(eds))
                ExportMeta(Path.Combine(outdir, "meta"), argskvp);

            Console.WriteLine("Successful export");
        }

        private static bool HasTexts(EDSsharp project)
        {
            return project.ods.Values.Any(od => od.prop.CO_texts.Count > 0 || od.subobjects.Values.Any(sub => sub.prop.CO_texts.Count > 0));
        }

        /// <summary>
        /// Exports the display texts (meta texts) as C source, see docs/meta-texts.md
        /// </summary>
        private static void ExportMeta(string outpath, Dictionary<string, string> argskvp)
        {
            var exporter = new CanOpenNodeMetaExporter();
            if (argskvp.ContainsKey("--odname"))
                exporter.Prefix = argskvp["--odname"];
            else if (argskvp.ContainsKey("--export-project"))
                exporter.Prefix = "meta";
            if (argskvp.ContainsKey("--odfile"))
            {
                string odfile = Path.GetFullPath(argskvp["--odfile"]);
                if (!File.Exists(odfile))
                {
                    Program.WriteError($"--odfile not found: {odfile}");
                    Environment.Exit(1);
                }
                exporter.SourceOd = LoadProject(odfile);
                if (exporter.SourceOd == null)
                {
                    Program.WriteError($"--odfile could not be read: {odfile}");
                    Environment.Exit(1);
                }
            }
            if (argskvp.ContainsKey("--glyphs"))
                Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(argskvp["--glyphs"])));
            if (argskvp.ContainsKey("--langs"))
                exporter.Languages = argskvp["--langs"].Split(',').Select(l => l.Trim()).Where(l => l.Length > 0).ToList();
            if (argskvp.ContainsKey("--glyphs"))
                exporter.GlyphFile = Path.GetFullPath(argskvp["--glyphs"]);

            exporter.Export(Path.GetFullPath(outpath), eds);

            foreach (string message in exporter.Messages)
                Console.WriteLine("WARNING :" + message);
            Console.WriteLine(exporter.Summary);
        }

        private static EDSsharp LoadProject(string infile)
        {
            switch (Path.GetExtension(infile).ToLower())
            {
                case ".xdd":
                case ".xdc":
                case ".xpd":
                case ".xui": // user interface (meta project with display texts), XDD 1.1 content
                    return openXDDfile(infile);

                case ".eds":
                case ".dcf":
                    return openEDSfile(infile);

                case ".json":
                    return openProtobuffile(infile, true);

                case ".binpb":
                    return openProtobuffile(infile, false);

                default:
                    Program.WriteError("Invalid INFILE extension.");
                    return null;
            }
        }

        private static void WriteError(string message)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.Error.WriteLine(message);
            Console.ResetColor();
            Console.WriteLine("");
        }

        private static EDSsharp openEDSfile(string infile)
        {
            var loadedEds = new EDSsharp();
            loadedEds.Loadfile(infile);
            loadedEds.projectFilename = infile;
            return loadedEds;
        }

        private static EDSsharp openXDDfile(string path)
        {
            EDSsharp loadedEds = XddLoader.Load(path);

            loadedEds.projectFilename = path;
            return loadedEds;
        }

        private static EDSsharp openProtobuffile(string path, bool json)
        {
            CanOpenXDD_1_1 coxml_1_1 = new CanOpenXDD_1_1();
            EDSsharp loadedEds = coxml_1_1.ReadProtobuf(path, json);

            if (loadedEds == null)
                return null;

            loadedEds.projectFilename = path;
            return loadedEds;
        }

        private static void Export(string outpath, string outType)
        {
            outpath = Path.GetFullPath(outpath);

            string savePath = Path.GetDirectoryName(outpath);

            eds.fi.exportFolder = savePath;

            Warnings.warning_list.Clear();

            var exporterDef = FindMatchingExporter(outpath, outType);

            if(exporterDef == null)
            {
                throw new Exception("Unable to find matching exporter)");
            }

            var edss = new List<EDSsharp> { eds };
            exporterDef.Func(outpath, edss);

            foreach(string warning in Warnings.warning_list)
            {
                Console.WriteLine("WARNING :" + warning);
            }

        }

        static ExporterDescriptor FindMatchingExporter(string outpath, string outType)
        {
            //Find exporter(s) matching the file extension
            var exporters = Filetypes.GetExporters();

            var outFiletype = Path.GetExtension(outpath);
            var exporterMatchingFiletype = new List<ExporterDescriptor>();
            foreach (var exporter in exporters)
            {
                foreach (var type in exporter.Filetypes)
                {
                    if (type == outFiletype)
                    {
                        exporterMatchingFiletype.Add(exporter);
                        break;
                    }
                }
            }

            if (exporterMatchingFiletype.Count == 1)
            {
                //If only one match we use that one.
                return exporterMatchingFiletype[0];
            }

            //If multiple or zero matches use type
            foreach (var exporter in exporters)
            {
                if (exporter.Description.Replace(" ", null) == outType)
                {
                    return exporter;
                }
            }
            return null;
        }

        static void PrintHelpText()
        {
            string name = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]);
            Console.WriteLine($"Usage: {name} --infile FILE1 --outfile FILE2 [--type EXPORTER]");
            Console.WriteLine($"       {name} --export-project --infile FILE --outdir DIR [--od BASENAME] [--odname PREFIX] [--json FILE.json] [--canopennode v4|legacy]");
            Console.WriteLine($"       {name} --infile UI.xui --outfile meta.c --type CanOpenNodeMeta [--odfile OD.xdd] [--odname PREFIX] [--langs de,en] [--glyphs FILE.txt]");
            Console.WriteLine("Converts a given XDD or EDS file to many other available types.");
            Console.WriteLine($"Example: {name} --infile project.xdd --outfile map.md --type NetworkPDOReport");
            Console.WriteLine($"Example: {name} --export-project --infile project.xdd --outdir ./out");
            Console.WriteLine("");
            Console.WriteLine("FILE1 shall be a .xdd, .xui, .eds, .json, or .binpb file.");
            Console.WriteLine("FILE2 shall have the extension of one of the supported exporters below.");
            Console.WriteLine("EXPORTER shall be one of the listed exporters below IF AND ONLY IF multiple of them support your output file extension.");
            Console.WriteLine("");
            Console.WriteLine("Exporter types:");

            var exporters = Filetypes.GetExporters();
            foreach (var exporter in exporters)
            {
                string filetypes = "";
                for (int i = 0; i < exporter.Filetypes.Length; i++)
                {
                    filetypes += exporter.Filetypes[i];
                    //add seperator char if multiple filetypes
                    if(i +1 != exporter.Filetypes.Length)
                    {
                        filetypes += ',';
                    }
                }

                string description = $"  {exporter.Description.Replace(" ",null)} [{filetypes}]";
                Console.WriteLine(description);
            }
        }

        static void PrintExportProjectHelpText()
        {
            string name = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]);
            Console.WriteLine($"Usage: {name} --export-project --infile FILE --outdir DIR [--od BASENAME] [--odname PREFIX] [--json FILE.json] [--canopennode v4|legacy] [--odfile OD.xdd] [--langs de,en] [--glyphs FILE.txt]");
            Console.WriteLine("Exports a project file to CanOpenNode .c/.h and CanOpenNode protobuf JSON.");
            Console.WriteLine($"Example: {name} --export-project --infile project.xdd --outdir ./out");
            Console.WriteLine("");
            Console.WriteLine("FILE shall be a .xdd, .xdc, .xpd, .xui, .eds, .dcf, .json, or .binpb file.");
            Console.WriteLine("DIR is the output directory.");
            Console.WriteLine("BASENAME is the base name for the generated .c and .h files (default: input file name without extension).");
            Console.WriteLine("FILE.json is the output JSON path (default: DIR/BASENAME.json).");
            Console.WriteLine("--canopennode defaults to v4.");
            Console.WriteLine("");
            Console.WriteLine("Display texts (docs/meta-texts.md): a meta project (user interface, .xui) is exported to meta.c/meta.h");
            Console.WriteLine("(BASENAME default 'meta') instead of the object dictionary; texts stored in an");
            Console.WriteLine("object dictionary are exported to meta.c/meta.h in addition. Options:");
            Console.WriteLine("  --odfile OD.xdd     object dictionary for the meta addresses (default: the file");
            Console.WriteLine("                      named in the meta project, otherwise its own addresses)");
            Console.WriteLine("  --langs de,en       export only these languages");
            Console.WriteLine("  --glyphs FILE.txt   write all characters used in the texts (for LVGL fonts)");
        }
    }
}
