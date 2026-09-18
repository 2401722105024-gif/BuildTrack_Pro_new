document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const selectedSite = urlParams.get("site") || urlParams.get("id") || "SITE-101";

  let state = {
    selectedSite: selectedSite,
    project: null,
    records: [],
    stats: null,
    charts: {
      clientMaterial: null,
      clientCategory: null,
      clientLabour: null,
      clientWorkers: null,
      clientTimeline: null
    }
  };

  function cleanNumber(val) {
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val)
      .replace(/Rs\./gi, "")
      .replace(/INR/gi, "")
      .replace(/₹/gi, "")
      .replace(/,/g, "")
      .replace(/\$/g, "")
      .trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }

  function formatINR(val) {
    const num = cleanNumber(val);
    return "Rs. " + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return dateStr; }
  }

  // PHOTO LIGHTBOX
  const photoViewerModal = document.getElementById("photoViewerModal");
  const photoViewerImg = document.getElementById("photoViewerImg");
  const photoViewerCaption = document.getElementById("photoViewerCaption");
  const closePhotoViewerBtn = document.getElementById("closePhotoViewerBtn");

  window.openPhotoLightbox = function(photoUrl, caption) {
    if (!photoViewerModal || !photoViewerImg) return;
    photoViewerImg.src = photoUrl;
    if (photoViewerCaption) photoViewerCaption.textContent = caption || "Verified Site Photo Proof";
    photoViewerModal.classList.remove("hidden");
  };

  if (closePhotoViewerBtn) {
    closePhotoViewerBtn.addEventListener("click", () => {
      if (photoViewerModal) photoViewerModal.classList.add("hidden");
    });
  }

  if (photoViewerModal) {
    photoViewerModal.addEventListener("click", (e) => {
      if (e.target === photoViewerModal) {
        photoViewerModal.classList.add("hidden");
      }
    });
  }

  async function loadClientData() {
    try {
      const siteQuery = state.selectedSite ? `?site=${encodeURIComponent(state.selectedSite)}` : "";
      const [dataRes, statsRes, projRes] = await Promise.all([
        fetch(`/api/data${siteQuery}`),
        fetch(`/api/stats${siteQuery}`),
        fetch(`/api/projects/${encodeURIComponent(state.selectedSite)}`).catch(() => null)
      ]);

      const dataJson = await dataRes.json();
      const statsJson = await statsRes.json();
      let projJson = null;
      if (projRes && projRes.ok) {
        try { projJson = await projRes.json(); } catch(e) {}
      }

      if (projJson && projJson.success && projJson.project) {
        const p = projJson.project;
        state.project = p;
        const pTitle = document.getElementById("clientProjectTitle");
        const sBadge = document.getElementById("clientSiteIdBadge");
        const loc = document.getElementById("clientLocationText");
        const eng = document.getElementById("clientEngineerText");
        const ownerName = document.getElementById("clientOwnerName");

        if (pTitle) pTitle.textContent = p.site_name;
        if (sBadge) sBadge.textContent = p.site_id;
        if (loc) loc.innerHTML = `Location: ${p.location || 'Site Location'} &bull; Client: <strong>${p.client_name || 'Valued Client'}</strong>`;
        if (eng) eng.textContent = p.engineer_name || p.engineer_email || "Assigned Engineer";
      }

      if (dataJson.success) {
        state.records = dataJson.data || [];
        renderClientFeed(state.records);
      }

      if (statsJson.success) {
        state.stats = statsJson;
        renderClientKPIs(statsJson.summary, statsJson.by_work_type);
        renderClientCharts(statsJson);
      }
    } catch (err) {
      console.error("Error loading client data:", err);
    }
  }

  function renderClientKPIs(s, byWorkType) {
    if (!s) return;
    document.getElementById("clientTotalProjectAmount").textContent = formatINR(s.total_project_amount);
    document.getElementById("clientAdvanceReceived").textContent = formatINR(s.advance_received);
    document.getElementById("clientTotalExpense").textContent = formatINR(s.total_expense);
    document.getElementById("clientRemainingAdvance").textContent = formatINR(s.remaining_advance_balance);
    document.getElementById("clientRemainingProjectBalance").textContent = `Overall Contract Balance: ${formatINR(s.remaining_project_balance)}`;
    document.getElementById("clientEntriesCount").textContent = `${s.total_entries} Work Logs`;

    const advUsage = s.advance_received > 0 ? ((s.total_expense / s.advance_received) * 100).toFixed(1) : 0;
    const projUsage = s.total_project_amount > 0 ? ((s.total_expense / s.total_project_amount) * 100).toFixed(1) : 0;

    document.getElementById("clientAdvanceUsageText").textContent = `${advUsage}% of advance used (${formatINR(s.total_expense)} / ${formatINR(s.advance_received)})`;
    document.getElementById("clientProjectUsageText").textContent = `${projUsage}% of contract (${formatINR(s.total_expense)} / ${formatINR(s.total_project_amount)})`;

    const clientProgBar = document.getElementById("clientAdvanceProgressBar");
    if (clientProgBar) {
      clientProgBar.style.width = Math.min(advUsage, 100) + "%";
      clientProgBar.style.background = advUsage > 100 ? "linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)" : "linear-gradient(90deg, #10b981 0%, #3b82f6 100%)";
    }

    document.getElementById("clientMaterialCost").textContent = formatINR(s.total_material_cost);
    document.getElementById("clientLabourCost").textContent = formatINR(s.total_labour_cost);
    document.getElementById("clientTotalWorkers").textContent = s.total_workers.toLocaleString("en-IN");
    document.getElementById("clientCategoriesCount").textContent = Object.keys(byWorkType || {}).length;

    const total = s.total_expense || 1;
    document.getElementById("clientMaterialPercent").textContent = `${((s.total_material_cost / total) * 100).toFixed(1)}% of total spend`;
    document.getElementById("clientLabourPercent").textContent = `${((s.total_labour_cost / total) * 100).toFixed(1)}% of total spend`;
  }

  function renderClientCharts(stats) {
    if (!window.Chart || !stats) return;
    const byType = stats.by_work_type || {};
    const byMat = stats.by_material || {};
    const timeline = stats.timeline || {};

    const workLabels = Object.keys(byType);
    const matLabels = Object.keys(byMat);
    const timeLabels = Object.keys(timeline);

    const matCanvas = document.getElementById("clientMaterialChart");
    if (matCanvas) {
      if (state.charts.clientMaterial) state.charts.clientMaterial.destroy();
      state.charts.clientMaterial = new Chart(matCanvas, {
        type: "line",
        data: {
          labels: matLabels.length > 0 ? matLabels : ["No Records"],
          datasets: [{
            label: "Material Cost (INR)",
            data: matLabels.map(k => byMat[k].total_cost),
            borderColor: "#0284c7",
            backgroundColor: "rgba(2, 132, 199, 0.12)",
            fill: true,
            tension: 0.3,
            pointRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { ticks: { callback: (v) => "Rs. " + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v) } } }
        }
      });
    }

    const catCanvas = document.getElementById("clientCategoryChart");
    if (catCanvas) {
      if (state.charts.clientCategory) state.charts.clientCategory.destroy();
      state.charts.clientCategory = new Chart(catCanvas, {
        type: "bar",
        data: {
          labels: workLabels,
          datasets: [
            { label: "Material Spend", data: workLabels.map(k => byType[k].material_cost), backgroundColor: "#3b82f6", borderRadius: 4 },
            { label: "Labour Spend", data: workLabels.map(k => byType[k].labour_cost), backgroundColor: "#10b981", borderRadius: 4 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true },
            y: { stacked: true, ticks: { callback: (v) => "Rs. " + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v) } }
          }
        }
      });
    }

    const labCanvas = document.getElementById("clientLabourChart");
    if (labCanvas) {
      if (state.charts.clientLabour) state.charts.clientLabour.destroy();
      state.charts.clientLabour = new Chart(labCanvas, {
        type: "bar",
        data: {
          labels: workLabels,
          datasets: [{ label: "Labour Wages", data: workLabels.map(k => byType[k].labour_cost), backgroundColor: "#10b981", borderRadius: 4 }]
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          scales: { x: { ticks: { callback: (v) => "Rs. " + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v) } } }
        }
      });
    }

    const timeCanvas = document.getElementById("clientTimelineChart");
    if (timeCanvas) {
      if (state.charts.clientTimeline) state.charts.clientTimeline.destroy();
      state.charts.clientTimeline = new Chart(timeCanvas, {
        type: "line",
        data: {
          labels: timeLabels,
          datasets: [{
            label: "Daily Site Expenditure",
            data: timeLabels.map(k => timeline[k].total_expense),
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.09)",
            fill: true,
            tension: 0.35,
            pointRadius: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: { y: { ticks: { callback: (v) => "Rs. " + (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v) } } }
        }
      });
    }
  }

  function renderClientFeed(records) {
    const clientFeed = document.getElementById("clientFeedList");
    if (!clientFeed) return;

    if (!records || records.length === 0) {
      clientFeed.innerHTML = `<p style="color: var(--text-muted); padding: 16px;">No entries recorded for this construction site.</p>`;
      return;
    }

    clientFeed.innerHTML = [...records].reverse().map(r => {
      const expId = r["Expense ID"] || "-";
      const workType = r["Labour/Work Type"] || "General Work";
      const desc = r["Brief Description"] || "-";
      const date = formatDate(r["Date"]);
      const payMode = r["Payment Mode"] || "Cash";
      const matName = r["Material Name"] ? `Material: ${r["Material Name"]} (${r["Quantity"] || "-"} ${r["Unit"] || ""})` : null;
      const workers = r["Number of Workers"] ? `Workers: ${r["Number of Workers"]}` : null;
      const total = formatINR(r["Total Expense (INR)"]);
      const photoUrl = r["Site Photo"] || "";

      let badgeClass = "badge-cash";
      if (payMode === "Online Payment") badgeClass = "badge-online";
      else if (payMode === "Cheque") badgeClass = "badge-cheque";

      const photoHtml = (photoUrl && photoUrl !== "-")
        ? `<img src="${photoUrl}" class="feed-photo-thumb" alt="${expId}" onclick="openPhotoLightbox('${photoUrl}', '${expId}: ${workType}')" title="Click to view full photo">`
        : "";

      return `
        <div class="feed-item">
          <div class="feed-tag">${workType}</div>
          <div class="feed-body">
            <div class="feed-title-row">
              <h4 class="feed-title">${expId}: ${workType}</h4>
              <span class="feed-date">${date}</span>
            </div>
            <p class="feed-desc">${desc}</p>
            ${photoHtml}
            <div class="feed-meta">
              <span class="badge-pay-mode ${badgeClass}" style="font-size:0.7rem; padding:1px 6px;">Paid: ${payMode}</span>
              ${matName ? `<span>${matName}</span>` : ""}
              ${workers ? `<span>${workers}</span>` : ""}
              <span style="color: var(--primary); font-weight: 700;">Total: ${total}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  loadClientData();
  setInterval(loadClientData, 5000);
});