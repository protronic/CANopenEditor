using System;
using System.Security.Cryptography;
using System.Text;

namespace ODEditor
{
    /// <summary>
    /// Verschluesselte Ablage von Zugangsdaten in den Benutzereinstellungen.
    ///
    /// Verwendet DPAPI (ProtectedData, CurrentUser-Scope): Der Blob ist an das
    /// Windows-Benutzerkonto gebunden, unter Mono greift dessen managed
    /// DPAPI-Ersatz. Verschluesselte Werte tragen das Praefix "enc:";
    /// Werte ohne Praefix sind Altbestand im Klartext und werden beim
    /// naechsten Speichern migriert.
    /// </summary>
    internal static class SettingsCrypto
    {
        private const string Prefix = "enc:";
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("CANopenEditor.CouchDB.v1");

        /// <summary>
        /// Verschluesselt einen Klartext fuer die Ablage in den Einstellungen.
        /// </summary>
        /// <param name="plain">Klartext (z.B. Passwort)</param>
        /// <returns>"enc:"-praefixierter DPAPI-Blob (Base64); auf Plattformen
        /// ohne DPAPI notgedrungen der Klartext selbst</returns>
        public static string Protect(string plain)
        {
            if (string.IsNullOrEmpty(plain))
                return "";

            try
            {
                byte[] blob = ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), Entropy, DataProtectionScope.CurrentUser);
                return Prefix + Convert.ToBase64String(blob);
            }
            catch (Exception)
            {
                // Kein DPAPI verfuegbar - lieber funktionsfaehig im Klartext
                // (wird von Unprotect als Altbestand behandelt) als Absturz
                // beim Speichern der Einstellungen.
                return plain;
            }
        }

        /// <summary>
        /// Entschluesselt einen mit Protect abgelegten Wert.
        /// </summary>
        /// <param name="stored">Gespeicherter Wert (verschluesselt oder Klartext-Altbestand)</param>
        /// <returns>Klartext; leer, wenn der Blob nicht entschluesselbar ist
        /// (z.B. fremdes Benutzerprofil)</returns>
        public static string Unprotect(string stored)
        {
            if (string.IsNullOrEmpty(stored))
                return "";

            if (!stored.StartsWith(Prefix, StringComparison.Ordinal))
                return stored; // Altbestand im Klartext

            try
            {
                byte[] blob = Convert.FromBase64String(stored.Substring(Prefix.Length));
                return Encoding.UTF8.GetString(ProtectedData.Unprotect(blob, Entropy, DataProtectionScope.CurrentUser));
            }
            catch (Exception)
            {
                return "";
            }
        }
    }
}
