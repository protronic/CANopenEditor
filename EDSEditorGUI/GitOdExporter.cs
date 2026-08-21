using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using LibGit2Sharp;
using LibGit2Sharp.Handlers;
using libEDSsharp;

namespace ODEditor
{
    /// <summary>
    /// Exportiert die Object Dictionaries aller Geraete eines Projekts in ein
    /// Git-Repository: Repo in ein Temp-Verzeichnis klonen, pro Geraet einen
    /// Ordner mit &lt;name&gt;.c/&lt;name&gt;.h (CanOpenNode V4, OD_*-Symbole)
    /// befuellen, committen und auf den Default-Branch pushen.
    ///
    /// Verwendet LibGit2Sharp, damit kein installiertes git noetig ist
    /// (laeuft damit auch unter Wine).
    /// </summary>
    public static class GitOdExporter
    {
        /// <summary>
        /// Fuehrt Export, Commit und Push aus.
        /// </summary>
        /// <param name="devices">Geraete des Projekts (Anzeigename + EDS)</param>
        /// <param name="repoUrl">URL des Ziel-Repos (https://..., file://... oder lokaler Pfad)</param>
        /// <param name="username">Benutzer fuer HTTPS-Auth (optional)</param>
        /// <param name="password">Passwort bzw. Token fuer HTTPS-Auth (optional)</param>
        /// <returns>Zusammenfassung fuer die Anzeige im Dialog</returns>
        public static string ExportAndPush(IList<KeyValuePair<string, EDSsharp>> devices, string repoUrl, string username, string password)
        {
            if (string.IsNullOrWhiteSpace(repoUrl))
                throw new ArgumentException("Keine Git-Repo-URL konfiguriert (Tools > Preferences).");
            if (devices == null || devices.Count == 0)
                throw new ArgumentException("Kein Geraet geoeffnet - nichts zu exportieren.");

            CredentialsHandler credentials = null;
            if (!string.IsNullOrEmpty(username))
            {
                credentials = (url, usernameFromUrl, types) =>
                    new UsernamePasswordCredentials { Username = username, Password = password ?? "" };
            }

            string workdir = Path.Combine(Path.GetTempPath(), "edseditor-git-" + Guid.NewGuid().ToString("N"));
            try
            {
                var cloneOptions = new CloneOptions();
                cloneOptions.FetchOptions.CredentialsProvider = credentials;
                Repository.Clone(repoUrl, workdir, cloneOptions);

                var exported = new List<string>();
                using (var repo = new Repository(workdir))
                {
                    // Leeres Ziel-Repo: Der Klon startet mit ungeborenem HEAD auf
                    // libgit2s Default-Branch (master). Auf den vom Server
                    // angekuendigten Default-Branch (z.B. main) umstellen, damit
                    // der erste Push dort landet und nicht am HEAD vorbei.
                    if (repo.Info.IsHeadUnborn)
                    {
                        Remote origin = repo.Network.Remotes["origin"];
                        IEnumerable<Reference> remoteRefs = credentials != null
                            ? repo.Network.ListReferences(origin, credentials)
                            : repo.Network.ListReferences(origin);
                        Reference remoteHead = remoteRefs.FirstOrDefault(r => r.CanonicalName == "HEAD");
                        string target = remoteHead?.TargetIdentifier;
                        // Kuendigt der Server nichts an, "main" statt libgit2s
                        // "master" annehmen (Default moderner Forges).
                        if (target == null || !target.StartsWith("refs/heads/", StringComparison.Ordinal))
                            target = "refs/heads/main";
                        repo.Refs.UpdateTarget("HEAD", target);
                    }

                    var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (KeyValuePair<string, EDSsharp> device in devices)
                    {
                        string name = SanitizeName(device.Key);
                        // Namenskollisionen (z.B. zwei gleichnamige Geraete) aufloesen
                        string unique = name;
                        int i = 2;
                        while (!usedNames.Add(unique))
                            unique = $"{name}_{i++}";

                        string deviceDir = Path.Combine(workdir, unique);
                        Directory.CreateDirectory(deviceDir);

                        // Dateien heissen wie das Geraet, die Symbole im Code
                        // bleiben im GUI-Format OD_* (wie beim CLI-Export).
                        new CanOpenNodeExporter_V4().export(Path.Combine(deviceDir, unique), device.Value, "OD");
                        exported.Add(unique);
                    }

                    Commands.Stage(repo, "*");

                    if (!repo.RetrieveStatus().IsDirty)
                        return "Keine Aenderungen gegenueber dem Repo - nichts zu pushen.";

                    string author = string.IsNullOrEmpty(username) ? "CANopenEditor" : username;
                    var signature = new Signature(author, author + "@canopeneditor.local", DateTimeOffset.Now);
                    string message = $"OD-Export aus CANopenEditor {GetVersion()} ({exported.Count} Geraete: {string.Join(", ", exported)})";
                    Commit commit = repo.Commit(message, signature, signature);

                    // Bei einem leeren Ziel-Repo hat der Branch nach dem Klonen
                    // noch kein Upstream - fuer den ersten Push nachziehen.
                    if (repo.Head.TrackedBranch == null)
                    {
                        repo.Branches.Update(repo.Head,
                            b => { b.Remote = "origin"; b.UpstreamBranch = repo.Head.CanonicalName; });
                    }

                    var pushOptions = new PushOptions { CredentialsProvider = credentials };
                    repo.Network.Push(repo.Head, pushOptions);

                    var summary = new StringBuilder();
                    summary.AppendLine($"Erfolgreich gepusht: {repoUrl}");
                    summary.AppendLine($"Branch: {repo.Head.FriendlyName}, Commit: {commit.Sha.Substring(0, 7)}");
                    summary.AppendLine();
                    summary.AppendLine("Exportierte Geraete (je Ordner mit .c/.h):");
                    foreach (string name in exported)
                        summary.AppendLine($"  {name}/{name}.c  {name}/{name}.h");
                    return summary.ToString();
                }
            }
            finally
            {
                TryDeleteDirectory(workdir);
            }
        }

        /// <summary>
        /// Macht aus einem Geraetenamen einen git-/dateisystemtauglichen
        /// Ordner- und Dateinamen.
        /// </summary>
        /// <param name="name">Anzeigename des Geraets (z.B. ProductName)</param>
        /// <returns>Bereinigter Name, notfalls "device"</returns>
        public static string SanitizeName(string name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return "device";

            var sb = new StringBuilder(name.Length);
            foreach (char c in name.Trim())
                sb.Append(char.IsLetterOrDigit(c) || c == '_' || c == '-' ? c : '_');
            return sb.ToString();
        }

        private static string GetVersion()
        {
            var attrs = Assembly.GetExecutingAssembly()
                .GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false)
                as AssemblyInformationalVersionAttribute[];
            return (attrs != null && attrs.Length > 0) ? attrs[0].InformationalVersion : "";
        }

        /// <summary>
        /// Loescht das Temp-Klonverzeichnis; git-Objektdateien sind readonly
        /// und muessen vorher beschreibbar gemacht werden.
        /// </summary>
        /// <param name="path">zu loeschendes Verzeichnis</param>
        private static void TryDeleteDirectory(string path)
        {
            try
            {
                if (!Directory.Exists(path))
                    return;
                foreach (string file in Directory.GetFiles(path, "*", SearchOption.AllDirectories))
                    File.SetAttributes(file, FileAttributes.Normal);
                Directory.Delete(path, true);
            }
            catch
            {
                // Aufraeumen darf den Export nie scheitern lassen.
            }
        }
    }
}
