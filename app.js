const Service = require("node-windows").Service;
const path = require("path");

const svc = new Service({
  name: "MyWebService", // Name of the Windows Service
  description: "Node.js web service running as a Windows service",
  script: path.join(__dirname, "app.js"), // Path to app.js
  nodeOptions: ["--harmony", "--max_old_space_size=4096"],
});

if (process.argv.includes("--install")) {
  svc.on("install", () => {
    console.log("Service installed successfully!");
    svc.start();
  });
  svc.install();
} else if (process.argv.includes("--uninstall")) {
  svc.on("uninstall", () => {
    console.log("Service uninstalled successfully!");
  });
  svc.uninstall();
} else {
  // Start the Express web service if no install/uninstall argument is passed
  const express = require("express");
  const cors = require("cors");
  const bodyParser = require("body-parser");
  const app = express();
  const { execSync } = require("child_process");

  require("dotenv").config();

  app.use(cors());
  app.use(bodyParser.json());

  const GITLAB_API_URL =
    "https://gitlab.com/api/v4/projects/YOUR_PROJECT_ID/repository/commits";
  const GITLAB_TOKEN = process.env.GITLAB_TOKEN; // Securely stored token

  let latestCommitHash = null;

  async function checkForUpdates() {
    try {
      const response = await fetch(`${GITLAB_API_URL}?ref_name=main`, {
        headers: { "PRIVATE-TOKEN": GITLAB_TOKEN },
      });
      if (!response.ok) throw new Error("GitLab repository not reachable.");

      const data = await response.json();
      const latestCommit = data[0]?.id;

      if (!latestCommitHash || latestCommit !== latestCommitHash) {
        console.log("New update found, pulling changes...");
        latestCommitHash = latestCommit;
        execSync("git pull origin main");
      } else {
        console.log("No updates found, starting application normally.");
      }
    } catch (error) {
      console.error(`Error checking for updates: ${error.message}`);
      console.log("Starting application normally...");
    }
  }

  // API routes and other app configurations
  app.get("/rpa/:record_id", async (req, res) => {
    const recordId = req.params.record_id;

    try {
      // Fetch application hub data from the external API
      const applicationHubAPI = `https://ai-broker.korunaassist.com/fusion/v1/datasheets/dstLr3xUL37tbn2Sud/records?record_id=${recordId}`;
      const applicationHubResponse = await fetch(applicationHubAPI, {
        method: "GET",
        headers: {
          Authorization: "Bearer usk5YzjFkoAuRfYFNcPCM0j",
          "Content-Type": "application/json",
        },
      });

      if (applicationHubResponse.status !== 200) {
        return res
          .status(applicationHubResponse.status)
          .send("<h1>Application record not found</h1>");
      }

      // Parse the JSON response
      const applicationRecordData = await applicationHubResponse.json();

      if (
        !applicationRecordData.data ||
        !applicationRecordData.data.records ||
        applicationRecordData.data.records.length === 0
      ) {
        return res.status(404).send("<h1>Application record not found</h1>");
      }

      const targetRecordId = recordId;
      const applicationRecord = applicationRecordData.data.records.find(
        (record) => record.recordId === targetRecordId
      );

      if (!applicationRecord) {
        return res.status(404).send("<h1>Application record not found</h1>");
      }

      // Generate table rows from the record fields
      const dataRows = Object.entries(applicationRecord.fields)
        .map(([key, value]) => {
          let displayValue = "";

          // Handle specific fields with nested structures
          if (key === "License" || key === "Passport" || key === "Fact Find") {
            displayValue = Array.isArray(value)
              ? value
                  .map((item) => {
                    return `
                      Name: ${item.name}<br /><br />
                      Size: ${item.size} bytes<br /><br />
                      MIME Type: ${item.mimeType}<br /><br />
                      URL: ${item.url}<br />
                    `;
                  })
                  .join("")
              : value;
          } else if (
            key === "dependents" ||
            key === "applicants" ||
            key === "broker" ||
            key === "loanType" ||
            key === "status"
          ) {
            displayValue = Array.isArray(value)
              ? value
                  .map((item) => item.name || JSON.stringify(item))
                  .join(", ")
              : value;
          } else {
            // Handle all other fields directly
            displayValue = Array.isArray(value) ? value.join(", ") : value;
          }

          return `
            <tr>
              <td>${key}</td>
              <td>${displayValue}</td>
            </tr>
          `;
        })
        .join("");

      //End of application hub

      // Fetch broker hub data from the external API
      const brokerId = applicationRecord.fields.Broker[0];
      const brokerHubAPI = `https://ai-broker.korunaassist.com/fusion/v1/datasheets/dstuqAhBamoBAzziwt/records?record_id=${brokerId}`;
      const apiBrokerResponse = await fetch(brokerHubAPI, {
        method: "GET",
        headers: {
          Authorization: "Bearer usk5YzjFkoAuRfYFNcPCM0j",
          "Content-Type": "application/json",
        },
      });

      if (apiBrokerResponse.status !== 200) {
        return res
          .status(apiBrokerResponse.status)
          .send("<h1>Broker record not found</h1>");
      }

      const brokerData = await apiBrokerResponse.json();

      if (
        !brokerData.data ||
        !brokerData.data.records ||
        brokerData.data.records.length === 0
      ) {
        return res.status(404).send("<h1>Broker record not found</h1>");
      }

      const brokerRecord = brokerData.data.records.find(
        (record) => record.recordId === brokerId
      );

      if (!brokerRecord) {
        return res.status(404).send("<h1>Broker record not found</h1>");
      }

      const brokerInfo = {
        recordId: brokerRecord.recordId, // Record ID
        thirdPartyAggregator: brokerRecord.fields["3rd Party Aggregator"], // 3rd Party Aggregator
        thirdPartyCRM: brokerRecord.fields["3rd Party CRM"], // 3rd Party CRM
      };

      // Log the JSON object to check the values
      console.log("Broker Information JSON:", brokerInfo);

      // End of broker hub

      // Generate HTML with dark mode toggle and TagUI execution button
      const htmlResponse = `
        <html>
        <head>
            <title>Record Details</title>
            <style>
            body { font-family: Arial, sans-serif; transition: background-color 0.5s, color 0.5s; }
            table { width: 100%; border-collapse: collapse; transition: background-color 0.5s, color 0.5s; }
            table, th, td { border: 1px solid black; }
            th, td { padding: 10px; text-align: left; }
            button { margin-top: 10px; margin-bottom: 20px; padding: 10px 20px; font-size: 16px; cursor: pointer; }
            body.light-mode { background-color: white; color: black; }
            table.light-mode, th.light-mode, td.light-mode { background-color: white; color: black; }
            body.dark-mode { background-color: #121212; color: white; }
            table.dark-mode, th.dark-mode, td.dark-mode { background-color: #333; color: white; }
            th.dark-mode, td.dark-mode { background-color: #444; color: white; }
            </style>
            <script>
            // Embed applicationRecord and brokerInfo as JSON strings in the HTML
            const applicationData = ${JSON.stringify(applicationRecord.fields)};
            const brokerData = ${JSON.stringify(brokerInfo)};

            function toggleDarkMode() {
                const body = document.body;
                const table = document.querySelector("table");
                body.classList.toggle("dark-mode");
                body.classList.toggle("light-mode");
                table.classList.toggle("dark-mode");
                table.classList.toggle("light-mode");
            }

            function executeTagUI() {
                fetch("http://localhost:5213/execute-tagUI-script", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    applicationData: applicationData,
                    brokerData: brokerData
                })
                })
                .then(response => response.json())
                .then(data => {
                console.log(data.success ? "TagUI script executed successfully!" : "Failed to execute TagUI script.");
                console.log(data);
                })
                .catch(error => console.error("Error executing TagUI script:", error));
            }
            </script>
        </head>
        <body class="light-mode">
            <h1>Record Details for ID: ${recordId}</h1>
            <button onclick="toggleDarkMode()">Toggle Dark Mode</button>
            <table class="light-mode">
            <thead>
                <tr>
                <th class="light-mode">Field</th>
                <th class="light-mode">Value</th>
                </tr>
            </thead>
            <tbody>${dataRows}</tbody>
            </table>
            <button onclick="executeTagUI()">Run</button>
        </body>
        </html>
        `;

      // Send the HTML response
      res.send(htmlResponse);
    } catch (err) {
      console.error("Error fetching data from API:", err);
      res.status(500).send("<h1>Failed to fetch data</h1>");
    }
  });

  // Default route
  app.get("/", (req, res) => {
    res.send("The web service is running!");
  });

  const PORT = process.env.PORT || 5123;
  async function startApplication() {
    await checkForUpdates();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  startApplication();
}
