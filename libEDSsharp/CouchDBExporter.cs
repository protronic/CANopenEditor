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
using System.IO;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace libEDSsharp
{
    /// <summary>
    /// Export CANopen device data to CouchDB JSON format using CanOpenNode Protobuf JSON
    /// </summary>
    public class CouchDBExporter : IFileExporter
    {
        private readonly CanOpenXDD_1_1 xddExporter = new CanOpenXDD_1_1();
        private static readonly HttpClient httpClient = new HttpClient();

        /// <summary>
        /// Fetches all the different fileexporter types the class supports
        /// </summary>
        /// <returns>List of the different exporters the class supports</returns>
        public ExporterDescriptor[] GetExporters()
        {
            return new ExporterDescriptor[]
            {
                new ExporterDescriptor("CouchDB JSON (CanOpenNode Protobuf)", new string[] { ".json" }, 0, 
                    delegate (string filepath, List<EDSsharp> edss)
                    {
                        var exporter = new CouchDBExporter();
                        exporter.ExportSingleDocument(filepath, edss[0]);
                    }),
                new ExporterDescriptor("CouchDB JSON (Multiple Devices)", new string[] { ".json" }, ExporterDescriptor.ExporterFlags.MultipleNodeSupport,
                    delegate (string filepath, List<EDSsharp> edss)
                    {
                        var exporter = new CouchDBExporter();
                        exporter.ExportMultipleDocuments(filepath, edss);
                    })
            };
        }

        /// <summary>
        /// Export a single EDS object as a CouchDB document using CanOpenNode Protobuf JSON format
        /// </summary>
        /// <param name="filepath">Output file path</param>
        /// <param name="eds">EDS object to export</param>
        public void ExportSingleDocument(string filepath, EDSsharp eds)
        {
            // Use WriteProtobuf with json=true from CanOpenXDD_1_1
            xddExporter.WriteProtobuf(filepath, eds, true);
        }

        /// <summary>
        /// Export multiple EDS objects as separate JSON files or combined document
        /// </summary>
        /// <param name="filepath">Output file path</param>
        /// <param name="edsList">List of EDS objects to export</param>
        public void ExportMultipleDocuments(string filepath, List<EDSsharp> edsList)
        {
            string directory = Path.GetDirectoryName(filepath);
            string fileNameWithoutExt = Path.GetFileNameWithoutExtension(filepath);
            string extension = Path.GetExtension(filepath);

            // Export each device as a separate JSON file
            for (int i = 0; i < edsList.Count; i++)
            {
                var eds = edsList[i];
                string outputPath;
                
                if (edsList.Count == 1)
                {
                    outputPath = filepath;
                }
                else
                {
                    string deviceSuffix = $"_{eds.di.ProductName}_{eds.dc.NodeID}".Replace(" ", "_");
                    outputPath = Path.Combine(directory, $"{fileNameWithoutExt}{deviceSuffix}{extension}");
                }

                xddExporter.WriteProtobuf(outputPath, eds, true);
            }
        }

        /// <summary>
        /// Builds the value of a Basic-Auth Authorization header, or null if no
        /// credentials are available. Explicit username/password win; otherwise
        /// credentials embedded in the URL (http://user:pass@host) are used,
        /// because HttpClient silently ignores the userinfo part of a URL.
        /// </summary>
        /// <param name="couchDbUrl">CouchDB database URL, possibly containing userinfo</param>
        /// <param name="username">Explicit user name (optional)</param>
        /// <param name="password">Explicit password (optional)</param>
        /// <returns>Header value ("Basic ...") or null</returns>
        private static System.Net.Http.Headers.AuthenticationHeaderValue BuildBasicAuthHeader(string couchDbUrl, string username, string password)
        {
            string user = username;
            string pass = password;

            if (string.IsNullOrEmpty(user) &&
                Uri.TryCreate(couchDbUrl, UriKind.Absolute, out Uri uri) &&
                !string.IsNullOrEmpty(uri.UserInfo))
            {
                string[] parts = uri.UserInfo.Split(new[] { ':' }, 2);
                user = Uri.UnescapeDataString(parts[0]);
                pass = parts.Length > 1 ? Uri.UnescapeDataString(parts[1]) : "";
            }

            if (string.IsNullOrEmpty(user))
                return null;

            string token = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{user}:{pass ?? ""}"));
            return new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", token);
        }

        /// <summary>
        /// Upload to CouchDB via HTTP PUT
        /// </summary>
        /// <param name="couchDbUrl">CouchDB database URL (e.g., http://localhost:5984/canopen)</param>
        /// <param name="eds">EDS object to export</param>
        /// <param name="username">User name for HTTP Basic Auth (optional)</param>
        /// <param name="password">Password for HTTP Basic Auth (optional)</param>
        /// <returns>HTTP response message</returns>
        public async Task<string> UploadToCouchDB(string couchDbUrl, EDSsharp eds, string username = null, string password = null)
        {
            // Credentials go into each request instead of the shared HttpClient,
            // so parallel uploads against different servers cannot leak them.
            var authHeader = BuildBasicAuthHeader(couchDbUrl, username, password);

            // Create temporary file to get protobuf JSON content
            string tempFile = Path.GetTempFileName();
            try
            {
                xddExporter.WriteProtobuf(tempFile, eds, true);
                string protoContent = File.ReadAllText(tempFile);

                // Parse the protobuf JSON
                JObject protoJson = JObject.Parse(protoContent);

                // Create CouchDB document with required structure
                JObject couchDoc = new JObject
                {
                    ["_id"] = eds.di.ProductName ?? "unknown_device",
                    ["proto"] = protoJson
                };

                // Prepare HTTP PUT request
                string documentUrl = $"{couchDbUrl.TrimEnd('/')}/{couchDoc["_id"]}";

                // First, try to get the existing document to get its revision
                try
                {
                    var getRequest = new HttpRequestMessage(HttpMethod.Get, documentUrl);
                    if (authHeader != null)
                        getRequest.Headers.Authorization = authHeader;
                    HttpResponseMessage getResponse = await httpClient.SendAsync(getRequest);
                    if (getResponse.IsSuccessStatusCode)
                    {
                        string existingDoc = await getResponse.Content.ReadAsStringAsync();
                        JObject existingJson = JObject.Parse(existingDoc);
                        
                        // Add the revision from the existing document
                        if (existingJson.ContainsKey("_rev"))
                        {
                            couchDoc["_rev"] = existingJson["_rev"];
                        }
                    }
                }
                catch
                {
                    // Document doesn't exist yet, proceed with new document
                }

                var content = new StringContent(couchDoc.ToString(), Encoding.UTF8, "application/json");

                // Send PUT request
                var putRequest = new HttpRequestMessage(HttpMethod.Put, documentUrl) { Content = content };
                if (authHeader != null)
                    putRequest.Headers.Authorization = authHeader;
                HttpResponseMessage response = await httpClient.SendAsync(putRequest);
                
                if (response.IsSuccessStatusCode)
                {
                    string responseBody = await response.Content.ReadAsStringAsync();
                    return $"Success: {responseBody}";
                }
                else
                {
                    string errorBody = await response.Content.ReadAsStringAsync();
                    return $"Error {(int)response.StatusCode}: {errorBody}";
                }
            }
            finally
            {
                if (File.Exists(tempFile))
                    File.Delete(tempFile);
            }
        }
    }
}
