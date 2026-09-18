document.addEventListener("DOMContentLoaded", () => {
  // Application State
  let state = {
    currentUser: null,
    selectedRole: "owner",
    projects: [],
    selectedSiteId: "ALL", // 'ALL' or specific 'SITE-101'
    activeBudgetModalSite: null,
    records: [],
    stats: null,
    charts: {
      ownerMaterial: null,
      ownerCategory: null,
      ownerLabour: null,
      ownerWorkers: null,
      ownerTimeline: null
    },
    attachedPhotos: {
      owner: null,
      builder: null
    },
    cameraStream: null,
    cameraFacingMode: "environment",
    activePhotoTarget: "owner",
    capturedImageBase64: null
  };

  // -------------------------------------------------------------
  // HELPER FUNCTIONS
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // 1. AUTHENTICATION & LOGIN UI
  // -------------------------------------------------------------
  const loginView = document.getElementById("loginView");
  const appContainer = document.getElementById("appContainer");
  const loginForm = document.getElementById("loginForm");
  const forgotForm = document.getElementById("forgotForm");
  const loginAlert = document.getElementById("loginAlert");
  const forgotAlert = document.getElementById("forgotAlert");
  const loginEmail = document.getElementById("loginEmail");
  const loginPassword = document.getElementById("loginPassword");
  const loginSubmitBtn = document.getElementById("loginSubmitBtn");
  const toggleForgotBtn = document.getElementById("toggleForgotBtn");
  const backToLoginBtn = document.getElementById("backToLoginBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const activeRoleText = document.getElementById("activeRoleText");
  const portalSubTitle = document.getElementById("portalSubTitle");
  const shareClientLinkBtn = document.getElementById("shareClientLinkBtn");
  const toggleShowPwdBtn = document.getElementById("toggleShowPwdBtn");

  const forgotEmail = document.getElementById("forgotEmail");
  const forgotNewPassword = document.getElementById("forgotNewPassword");
  const forgotConfirmPassword = document.getElementById("forgotConfirmPassword");
  const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");

  if (toggleShowPwdBtn && loginPassword) {
    toggleShowPwdBtn.addEventListener("click", () => {
      if (loginPassword.type === "password") {
        loginPassword.type = "text";
        toggleShowPwdBtn.textContent = "Hide";
      } else {
        loginPassword.type = "password";
        toggleShowPwdBtn.textContent = "Show";
      }
    });
  }

  // Role Buttons
  const roleButtons = document.querySelectorAll(".role-btn[data-role]");
  roleButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      roleButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.selectedRole = btn.dataset.role;
      hideAlerts();
    });
  });

  function hideAlerts() {
    [loginAlert, forgotAlert].forEach(a => { if (a) a.classList.add("hidden"); });
  }

  function showAlert(elem, type, msg) {
    if (!elem) return;
    elem.className = `alert-box ${type}`;
    elem.textContent = msg;
    elem.classList.remove("hidden");
  }

  if (toggleForgotBtn) {
    toggleForgotBtn.addEventListener("click", () => {
      loginForm.classList.add("hidden");
      forgotForm.classList.remove("hidden");
      hideAlerts();
    });
  }

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", () => {
      forgotForm.classList.add("hidden");
      loginForm.classList.remove("hidden");
      hideAlerts();
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = loginEmail.value.trim();
      const password = loginPassword.value.trim();

      if (!email) {
        showAlert(loginAlert, "error", "Please enter your Company Email ID.");
        loginEmail.focus();
        return;
      }
      if (!password) {
        showAlert(loginAlert, "error", "Please enter your Access Password.");
        loginPassword.focus();
        return;
      }

      loginSubmitBtn.disabled = true;
      loginSubmitBtn.innerText = "Signing in...";

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, role: state.selectedRole })
        });
        const data = await res.json();
        if (data.success) {
          loginPassword.value = "";
          setTabSession(data.user);
        } else {
          showAlert(loginAlert, "error", data.error || "Authentication failed.");
        }
      } catch (err) {
        showAlert(loginAlert, "error", "Network error connecting to server.");
      } finally {
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerText = "Sign In to Portal";
      }
    });
  }

  // DIRECT PASSWORD UPDATE HANDLER
  if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = forgotEmail.value.trim();
      const newPwd = forgotNewPassword.value.trim();
      const confirmPwd = forgotConfirmPassword.value.trim();

      if (!newPwd || newPwd.length < 3) {
        showAlert(forgotAlert, "error", "Password must be at least 3 characters.");
        return;
      }
      if (newPwd !== confirmPwd) {
        showAlert(forgotAlert, "error", "Passwords do not match.");
        return;
      }

      forgotSubmitBtn.disabled = true;
      forgotSubmitBtn.innerText = "Updating password...";

      try {
        const res = await fetch("/api/company/update-member-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, new_password: newPwd })
        });
        const data = await res.json();
        if (data.success) {
          showAlert(forgotAlert, "success", data.message);
          setTimeout(() => {
            loginEmail.value = email;
            loginPassword.value = newPwd;
            forgotForm.classList.add("hidden");
            loginForm.classList.remove("hidden");
            hideAlerts();
          }, 1500);
        } else {
          showAlert(forgotAlert, "error", data.error || "Could not update password.");
        }
      } catch (err) {
        showAlert(forgotAlert, "error", "Network error updating password.");
      } finally {
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.innerText = "Update & Save Password";
      }
    });
  }

  // -------------------------------------------------------------
  // 2. SESSION SETUP & USER PORTAL
  // -------------------------------------------------------------
  function setTabSession(user) {
    state.currentUser = user;
    try {
      localStorage.setItem("buildtrack_company_user", JSON.stringify(user));
      sessionStorage.setItem("buildtrack_company_user", JSON.stringify(user));
    } catch (e) {}

    // Reset selected site ID based on user role to guarantee auto-selection
    if (user.role === "owner") {
      state.selectedSiteId = "ALL";
    } else {
      state.selectedSiteId = null; // Forces loadProjects to pick engineer's project automatically
    }

    loginView.classList.add("hidden");
    appContainer.classList.remove("hidden");
    renderPortalForRole(user.role);
    loadProjects().then(() => {
      loadAllData();
      if (user.role === "owner") loadAuthorizedTeam();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem("buildtrack_company_user");
        sessionStorage.removeItem("buildtrack_company_user");
      } catch (e) {}
      state.currentUser = null;
      state.selectedSiteId = "ALL";
      if (loginEmail) loginEmail.value = "";
      if (loginPassword) loginPassword.value = "";
      appContainer.classList.add("hidden");
      loginView.classList.remove("hidden");
      hideAlerts();
    });
  }

  if (shareClientLinkBtn) {
    shareClientLinkBtn.addEventListener("click", () => {
      const siteParam = (state.selectedSiteId && state.selectedSiteId !== "ALL") ? `?site=${state.selectedSiteId}` : "";
      const clientUrl = window.location.origin + "/client" + siteParam;
      navigator.clipboard.writeText(clientUrl).then(() => {
        alert("Client Progress Report Link Copied!\n\nURL: " + clientUrl);
      }).catch(() => {
        prompt("Copy Client Report Link:", clientUrl);
      });
    });
  }

  const openLiveClientBtn = document.getElementById("openLiveClientBtn");
  if (openLiveClientBtn) {
    openLiveClientBtn.addEventListener("click", () => {
      const targetSite = (state.selectedSiteId && state.selectedSiteId !== "ALL") ? state.selectedSiteId : (state.projects[0]?.site_id || "SITE-101");
      window.open(`/client?site=${encodeURIComponent(targetSite)}`, "_blank");
    });
  }

  function renderPortalForRole(role) {
    const ownerPortal = document.getElementById("ownerPortal");
    const builderPortal = document.getElementById("builderPortal");

    ownerPortal.classList.add("hidden");
    builderPortal.classList.add("hidden");

    const userName = state.currentUser?.name || (role.charAt(0).toUpperCase() + role.slice(1));

    if (role === "owner") {
      ownerPortal.classList.remove("hidden");
      activeRoleText.textContent = `Owner: ${userName}`;
      portalSubTitle.textContent = "Multi-Site & Multi-Client Intelligence Protocol";
      if (shareClientLinkBtn) shareClientLinkBtn.classList.remove("hidden");
      initOwnerFormDefaults();
    } else {
      builderPortal.classList.remove("hidden");
      activeRoleText.textContent = `Site Engineer: ${userName}`;
      portalSubTitle.textContent = "Assigned Site Execution & Procurement Logs";
      if (shareClientLinkBtn) shareClientLinkBtn.classList.add("hidden");
      initBuilderFormDefaults();
    }
  }

  try {
    const tabUserStr = localStorage.getItem("buildtrack_company_user") || sessionStorage.getItem("buildtrack_company_user");
    if (tabUserStr) {
      const tabUser = JSON.parse(tabUserStr);
      if (tabUser && tabUser.role) {
        setTabSession(tabUser);
      }
    }
  } catch (e) {
    try {
      localStorage.removeItem("buildtrack_company_user");
      sessionStorage.removeItem("buildtrack_company_user");
    } catch (err) {}
  }

  // -------------------------------------------------------------
  // 3. MULTI-SITE / ENGINEER & CLIENT LOGIC & SWITCHER
  // -------------------------------------------------------------
  const globalSiteSelect = document.getElementById("globalSiteSelect");
  const sitePillBar = document.getElementById("sitePillBar");
  const ownerFormSiteSelect = document.getElementById("ownerFormSiteSelect");
  const builderFormSiteSelect = document.getElementById("builderFormSiteSelect");
  const assignEngineerChoice = document.getElementById("assignEngineerChoice");
  const allSitesGrid = document.getElementById("allSitesGrid");
  const ownerSitesCountBadge = document.getElementById("ownerSitesCountBadge");

  async function loadProjects() {
    try {
      const isOwner = (state.currentUser?.role === "owner");
      const engParam = isOwner ? "" : `?engineer=${encodeURIComponent(state.currentUser?.email || '')}`;
      const res = await fetch(`/api/projects${engParam}`);
      const data = await res.json();

      if (data.success) {
        const deletedProjects = JSON.parse(localStorage.getItem("buildtrack_deleted_projects") || "[]").map(s => s.toUpperCase());
        state.projects = (data.projects || []).filter(p => p && p.site_id && !deletedProjects.includes(p.site_id.toUpperCase()));
        if (ownerSitesCountBadge) ownerSitesCountBadge.textContent = state.projects.length;

        // AUTOMATIC PROJECT SELECTION
        if (!isOwner) {
          if (state.projects.length > 0) {
            state.selectedSiteId = state.projects[0].site_id;
          }
        } else if (!state.selectedSiteId) {
          state.selectedSiteId = "ALL";
        }

        // Populate Top Dropdown with Engineer & Client Pairs
        if (globalSiteSelect) {
          let opts = isOwner ? `<option value="ALL">All Projects & Consolidated Total (All Clients)</option>` : "";
          opts += state.projects.map(p => {
            const eng = p.engineer_name || p.engineer_email;
            const client = p.client_name || "Client";
            return `
              <option value="${p.site_id}">
                [${p.site_id}] ${p.site_name} (Engineer: ${eng} - Client: ${client})
              </option>
            `;
          }).join("");
          globalSiteSelect.innerHTML = opts;

          if (state.selectedSiteId) {
            globalSiteSelect.value = state.selectedSiteId;
          }
        }

        // Populate Form Selectors
        const formOpts = state.projects.map(p => `<option value="${p.site_id}">[${p.site_id}] ${p.site_name} (Engineer: ${p.engineer_name || p.engineer_email} &bull; Client: ${p.client_name || 'Client'})</option>`).join("");
        if (ownerFormSiteSelect) {
          ownerFormSiteSelect.innerHTML = formOpts;
          if (state.selectedSiteId && state.selectedSiteId !== "ALL") ownerFormSiteSelect.value = state.selectedSiteId;
        }
        if (builderFormSiteSelect) {
          builderFormSiteSelect.innerHTML = formOpts;
          if (state.selectedSiteId && state.selectedSiteId !== "ALL") builderFormSiteSelect.value = state.selectedSiteId;
        }

        // Populate Pill Bar
        if (sitePillBar) {
          let pills = isOwner ? `<button type="button" class="site-pill-btn ${state.selectedSiteId === 'ALL' ? 'active' : ''}" data-site="ALL">All Projects</button>` : "";
          pills += state.projects.map(p => {
            const shortEngName = (p.engineer_name || p.engineer_email || "Engineer").split(" ")[0].split("@")[0];
            const shortClient = (p.client_name || "Client").split(" ")[0];
            return `
              <button type="button" class="site-pill-btn ${state.selectedSiteId === p.site_id ? 'active' : ''}" data-site="${p.site_id}">
                ${shortEngName} (${shortClient} - ${p.site_id})
              </button>
            `;
          }).join("");
          sitePillBar.innerHTML = pills;

          sitePillBar.querySelectorAll(".site-pill-btn").forEach(btn => {
            btn.addEventListener("click", () => {
              switchSite(btn.dataset.site);
            });
          });
        }

        // Populate Assign Engineer Choice in new project form
        if (assignEngineerChoice) {
          try {
            const uRes = await fetch("/api/company/users");
            const uData = await uRes.json();
            if (uData.success) {
              const engineers = uData.users.filter(u => u.role === "builder");
              let engOpts = engineers.map(e => `<option value="${e.email}">${e.name} (${e.email})</option>`).join("");
              engOpts += `<option value="NEW">+ Register New Engineer Email...</option>`;
              assignEngineerChoice.innerHTML = engOpts;
            }
          } catch(e) {}
        }

        // Sync download links for current project
        const excelUrl = (state.selectedSiteId && state.selectedSiteId !== "ALL") ? `/api/export?site=${state.selectedSiteId}` : `/api/export`;
        const globalExcelBtn = document.getElementById("globalExcelBtn");
        if (globalExcelBtn) globalExcelBtn.href = excelUrl;

        renderSitesGrid();
      }
    } catch (err) {
      console.error("Error loading projects:", err);
    }
  }

  function switchSite(siteId) {
    state.selectedSiteId = siteId;
    if (globalSiteSelect) globalSiteSelect.value = siteId;
    if (sitePillBar) {
      sitePillBar.querySelectorAll(".site-pill-btn").forEach(b => {
        if (b.dataset.site === siteId) b.classList.add("active");
        else b.classList.remove("active");
      });
    }
    if (ownerFormSiteSelect && siteId !== "ALL") {
      ownerFormSiteSelect.value = siteId;
      const oExpId = document.getElementById("ownerExpId");
      fetch(`/api/next-id?site=${encodeURIComponent(siteId)}`).then(r => r.json()).then(d => { if (d.next_id && oExpId) oExpId.value = d.next_id; });
    }
    if (builderFormSiteSelect && siteId !== "ALL") {
      builderFormSiteSelect.value = siteId;
      const bExpId = document.getElementById("builderExpId");
      fetch(`/api/next-id?site=${encodeURIComponent(siteId)}`).then(r => r.json()).then(d => { if (d.next_id && bExpId) bExpId.value = d.next_id; });
    }

    const excelUrl = (siteId && siteId !== "ALL") ? `/api/export?site=${siteId}` : `/api/export`;
    const globalExcelBtn = document.getElementById("globalExcelBtn");
    if (globalExcelBtn) globalExcelBtn.href = excelUrl;
    const tableExcelBtn = document.querySelector("#owner-table-tab a[href*='/api/export']");
    if (tableExcelBtn) tableExcelBtn.href = excelUrl;

    loadAllData();
  }

  if (globalSiteSelect) {
    globalSiteSelect.addEventListener("change", (e) => {
      switchSite(e.target.value);
    });
  }

  function renderSitesGrid() {
    if (!allSitesGrid) return;
    if (!state.projects || state.projects.length === 0) {
      allSitesGrid.innerHTML = `<p style="color:var(--text-muted); padding:20px;">No construction projects registered yet.</p>`;
      return;
    }

    allSitesGrid.innerHTML = state.projects.map(p => {
      const clientLink = `${window.location.origin}/client?site=${p.site_id}`;
      return `
        <div class="site-card">
          <div class="site-card-top">
            <div>
              <span class="site-code-badge">${p.site_id}</span>
              <h4 class="site-card-title">${p.site_name}</h4>
              <p class="site-card-location">Location: ${p.location || 'Site Location'}</p>
            </div>
            <span style="font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:9999px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;">${p.status || 'Active'}</span>
          </div>

          <div class="site-engineer-box">
            <div class="engineer-avatar">${(p.engineer_name || 'E').charAt(0).toUpperCase()}</div>
            <div class="engineer-info">
              <strong>Assigned Engineer: ${p.engineer_name || 'Site Engineer'}</strong>
              <span>${p.engineer_email}</span>
            </div>
          </div>

          <div style="font-size:0.84rem; background:#eff6ff; padding:10px 12px; border-radius:6px; border:1px solid #bfdbfe; margin-top:8px; color:#1e40af;">
            <strong>Client: ${p.client_name || 'Valued Client'}</strong> ${p.client_email ? `(${p.client_email})` : ''}
          </div>

          <div class="site-financial-mini" style="margin-top:10px;">
            <div>
              <span>Contract Budget:</span>
              <strong>${formatINR(p.total_contract_amount)}</strong>
            </div>
            <div>
              <span>Advance Received:</span>
              <strong style="color:#059669;">${formatINR(p.advance_received)}</strong>
            </div>
          </div>

          <div class="site-card-actions">
            <button type="button" class="btn-xs" style="background:#2563eb; color:#fff;" onclick="window.openSiteDashboard('${p.site_id}')">
              View Dashboard
            </button>
            <button type="button" class="btn-xs" style="background:#7c3aed; color:#fff;" onclick="window.openProjectBudgetModal('${p.site_id}')">
              Budget & Payments
            </button>
            <button type="button" class="btn-xs" style="background:#059669; color:#fff;" onclick="window.open('${clientLink}', '_blank')">
              Live Client Report
            </button>
            <button type="button" class="btn-xs" style="background:#f1f5f9; border:1px solid #cbd5e1;" onclick="window.copySiteClientLink('${clientLink}')">
              Copy Link
            </button>
            <button type="button" class="btn-xs" style="color:#ef4444; background:#fff; border:1px solid #fca5a5;" onclick="window.deleteSite('${p.site_id}', '${p.site_name}')">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  window.openSiteDashboard = function(siteId) {
    switchSite(siteId);
    const dashTabBtn = document.querySelector("#ownerPortal .tab-btn[data-tab='owner-dash-tab']");
    if (dashTabBtn) dashTabBtn.click();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.copySiteClientLink = function(url) {
    navigator.clipboard.writeText(url).then(() => {
      alert("Client Progress Report Link Copied:\n\n" + url);
    }).catch(() => {
      prompt("Copy Client Link:", url);
    });
  };

  window.deleteSite = async function(siteId, siteName) {
    if (!confirm(`Are you sure you want to PERMANENTLY delete project "${siteName}" (${siteId})?\n\nThis will permanently remove the project and its records from the database.`)) return;
    try {
      try {
        let deleted = JSON.parse(localStorage.getItem("buildtrack_deleted_projects") || "[]").map(s => s.toUpperCase());
        const cleanSid = siteId.trim().toUpperCase();
        if (!deleted.includes(cleanSid)) {
          deleted.push(cleanSid);
          localStorage.setItem("buildtrack_deleted_projects", JSON.stringify(deleted));
        }
      } catch (e) {}

      const res = await fetch(`/api/projects/${encodeURIComponent(siteId)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Project ${siteId} deleted permanently.`);
        if (state.selectedSiteId === siteId) state.selectedSiteId = "ALL";
        loadProjects().then(() => loadAllData());
      } else {
        alert("Error: " + (data.error || "Could not delete project."));
      }
    } catch(e) {
      alert("Network error deleting project.");
    }
  };

  const newEngineerFields = document.getElementById("newEngineerFields");
  if (assignEngineerChoice) {
    assignEngineerChoice.addEventListener("change", () => {
      if (assignEngineerChoice.value === "NEW") {
        if (newEngineerFields) newEngineerFields.classList.remove("hidden");
      } else {
        if (newEngineerFields) newEngineerFields.classList.add("hidden");
      }
    });
  }

  // CREATE / SANCTION NEW PROJECT & ASSIGN TO ENGINEER & CLIENT
  const createSiteForm = document.getElementById("createSiteForm");
  if (createSiteForm) {
    createSiteForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const siteName = document.getElementById("newSiteName")?.value.trim();
      const siteId = document.getElementById("newSiteId")?.value.trim().toUpperCase();
      const location = document.getElementById("newSiteLocation")?.value.trim();
      const clientName = document.getElementById("newSiteClientName")?.value.trim();
      const clientEmail = document.getElementById("newSiteClientEmail")?.value.trim();
      const totalAmount = cleanNumber(document.getElementById("newSiteTotalAmount")?.value);
      const advance = cleanNumber(document.getElementById("newSiteAdvanceReceived")?.value);
      const alertBox = document.getElementById("createSiteAlert");
      const submitBtn = document.getElementById("createSiteBtn");

      let engEmail = assignEngineerChoice?.value;
      let engName = "";
      let engPassword = "123";

      if (engEmail === "NEW") {
        engEmail = document.getElementById("newEngEmail")?.value.trim();
        engName = document.getElementById("newEngName")?.value.trim();
        engPassword = document.getElementById("newEngPassword")?.value.trim() || "123";
        if (!engEmail || !engEmail.includes("@")) {
          showFormAlert(alertBox, "error", "Please enter a valid engineer email.");
          return;
        }
      }

      submitBtn.disabled = true;
      submitBtn.innerText = "Sanctioning Project...";

      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            site_name: siteName,
            site_id: siteId || undefined,
            location: location,
            client_name: clientName,
            client_email: clientEmail,
            total_contract_amount: totalAmount,
            advance_received: advance,
            payment_mode: "Online Payment",
            engineer_email: engEmail,
            engineer_name: engName,
            engineer_password: engPassword
          })
        });

        const data = await res.json();
        if (data.success) {
          try {
            if (data.project && data.project.site_id) {
              let deleted = JSON.parse(localStorage.getItem("buildtrack_deleted_projects") || "[]").map(s => s.toUpperCase());
              const newSid = data.project.site_id.toUpperCase();
              deleted = deleted.filter(s => s !== newSid);
              localStorage.setItem("buildtrack_deleted_projects", JSON.stringify(deleted));
            }
          } catch (e) {}

          showFormAlert(alertBox, "success", data.message);
          createSiteForm.reset();
          if (newEngineerFields) newEngineerFields.classList.add("hidden");
          await loadProjects();
          switchSite(data.project.site_id);
        } else {
          showFormAlert(alertBox, "error", data.error || "Could not sanction project.");
        }
      } catch (err) {
        showFormAlert(alertBox, "error", "Network error sanctioning construction project.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "Sanction & Launch Construction Project";
      }
    });
  }

  // -------------------------------------------------------------
  // 4. TEAM DIRECTORY & PASSWORD CHANGING
  // -------------------------------------------------------------
  async function loadAuthorizedTeam() {
    try {
      const res = await fetch("/api/company/users");
      const data = await res.json();
      if (data.success && Array.isArray(data.users)) {
        // Safe backup in browser storage
        try {
          const cachedTeamStr = localStorage.getItem("buildtrack_authorized_team");
          const cachedTeam = cachedTeamStr ? JSON.parse(cachedTeamStr) : [];
          const deletedUsers = JSON.parse(localStorage.getItem("buildtrack_deleted_users") || "[]").map(e => e.toLowerCase());

          // Check if server is missing any accounts that were in local cache and NOT deleted
          const serverEmails = new Set(data.users.map(u => u.email.toLowerCase()));
          const missingUsers = cachedTeam.filter(u => u && u.email && !serverEmails.has(u.email.toLowerCase()) && !deletedUsers.includes(u.email.toLowerCase()));

          if (missingUsers.length > 0) {
            fetch("/api/company/sync-accounts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ users: missingUsers, deleted_users: deletedUsers })
            }).then(r => r.json()).then(syncData => {
              if (syncData.success && syncData.synced_count > 0) {
                fetch("/api/company/users").then(r => r.json()).then(newData => {
                  if (newData.success) renderTeamList(newData.users);
                });
              }
            }).catch(() => {});
          }

          // Filter out any deleted users before caching
          const activeCleanUsers = data.users.filter(u => !deletedUsers.includes(u.email.toLowerCase()));
          localStorage.setItem("buildtrack_authorized_team", JSON.stringify(activeCleanUsers));
          renderTeamList(activeCleanUsers);
          return;
        } catch (e) {}

        renderTeamList(data.users);
      }
    } catch (e) { console.error("Team load error:", e); }
  }

  function renderTeamList(users) {
    const teamList = document.getElementById("activeTeamList");
    if (!teamList) return;
    const deletedUsers = JSON.parse(localStorage.getItem("buildtrack_deleted_users") || "[]").map(e => e.toLowerCase());
    const validUsers = users.filter(u => u && u.email && !deletedUsers.includes(u.email.toLowerCase()));

    teamList.innerHTML = validUsers.map(u => {
      const isOwner = (u.role === "owner");
      const isActive = (u.status || "active") === "active";
      const safeName = (u.name || "").replace(/'/g, "\\'");

      const statusBadge = isOwner
        ? `<span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:9999px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;">COMPANY OWNER</span>`
        : (isActive
            ? `<span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:9999px; background:#ecfdf5; color:#059669; border:1px solid #a7f3d0;">ACTIVE (ENABLED)</span>`
            : `<span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:9999px; background:#fef2f2; color:#dc2626; border:1px solid #fecaca;">DISABLED (LOCKED)</span>`);

      return `
        <div style="background:#ffffff; padding:14px 16px; border-radius:8px; border:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          <div>
            <div style="display:flex; align-items:center; gap:8px;">
              <strong style="font-size:0.95rem;">${u.name}</strong>
              <span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:9999px; background:#f1f5f9; color:#475569; text-transform:uppercase;">${u.role}</span>
              ${statusBadge}
            </div>
            <div style="font-size:0.8rem; color:#64748b; font-family:var(--font-mono); margin-top:3px;">
              ${u.email} &bull; <span style="font-size:0.75rem; color:#94a3b8;">Last active: ${u.last_active || 'Never'}</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn-xs" style="background:#3b82f6; color:#fff; border:none;" onclick="window.changeMemberPasswordPrompt('${u.email}', '${safeName}')">Set Password</button>
            <button type="button" class="${isActive ? 'btn-danger-sm' : 'btn-primary-sm'}" onclick="window.toggleEmployeeAccess('${u.email}', '${safeName}')">${isActive ? 'Disable Access' : 'Enable Access'}</button>
            <button type="button" class="btn-xs" style="color:#dc2626; background:#fff; border:1px solid #fca5a5; font-weight:600;" onclick="window.revokeCompanyUser('${u.email}', '${safeName}', '${u.role}')">Delete</button>
          </div>
        </div>
      `;
    }).join("");
  }

  window.changeMemberPasswordPrompt = async function(email, name) {
    const newPwd = prompt(`Enter new password for ${name} (${email}):`, "123");
    if (!newPwd || !newPwd.trim()) return;

    try {
      const res = await fetch("/api/company/update-member-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, new_password: newPwd.trim() })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        loadAuthorizedTeam();
      } else {
        alert("Error: " + data.error);
      }
    } catch (err) {
      alert("Network error updating password.");
    }
  };

  window.toggleEmployeeAccess = async function(email, name) {
    try {
      const res = await fetch("/api/company/toggle-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        loadAuthorizedTeam();
      }
    } catch (err) { alert("Network error updating access status."); }
  };

  window.revokeCompanyUser = async function(email, name, role) {
    const isOwner = (role === "owner");
    const isCurrent = (state.currentUser && state.currentUser.email && state.currentUser.email.toLowerCase() === email.toLowerCase());

    let confirmMsg = `Are you sure you want to PERMANENTLY delete ${isOwner ? 'Owner' : 'Employee'} ${name} (${email})?\n\nThis account will be permanently removed.`;
    if (isCurrent) {
      confirmMsg = `⚠️ WARNING: You are currently logged in as ${name} (${email})!\n\nDeleting this account will permanently erase your login and log you out immediately.\n\nDo you want to proceed with permanent deletion?`;
    }

    if (!confirm(confirmMsg)) return;

    try {
      // 1. Immediately store in client tombstone
      try {
        let deleted = JSON.parse(localStorage.getItem("buildtrack_deleted_users") || "[]").map(e => e.toLowerCase());
        if (!deleted.includes(email.toLowerCase())) {
          deleted.push(email.toLowerCase());
          localStorage.setItem("buildtrack_deleted_users", JSON.stringify(deleted));
        }
        let cached = JSON.parse(localStorage.getItem("buildtrack_authorized_team") || "[]");
        cached = cached.filter(u => u && u.email && u.email.toLowerCase() !== email.toLowerCase());
        localStorage.setItem("buildtrack_authorized_team", JSON.stringify(cached));
      } catch (e) {}

      // 2. Call backend permanent deletion API
      const res = await fetch(`/api/company/users/${encodeURIComponent(email)}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `Account ${email} permanently deleted.`);
        if (isCurrent) {
          try {
            localStorage.removeItem("buildtrack_company_user");
            sessionStorage.removeItem("buildtrack_company_user");
          } catch (e) {}
          state.currentUser = null;
          appContainer.classList.add("hidden");
          loginView.classList.remove("hidden");
          return;
        }
        loadAuthorizedTeam();
      } else {
        alert("Error: " + (data.error || "Could not delete account."));
      }
    } catch (err) {
      alert("Network error deleting user.");
    }
  };

  const addTeamMemberForm = document.getElementById("addTeamMemberForm");
  if (addTeamMemberForm) {
    addTeamMemberForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("newMemberName")?.value.trim();
      const email = document.getElementById("newMemberEmail")?.value.trim();
      const role = document.getElementById("newMemberRole")?.value;
      const password = document.getElementById("newMemberPassword")?.value.trim() || "123";
      const alertBox = document.getElementById("teamFormAlert");
      const submitBtn = document.getElementById("addTeamMemberBtn");

      submitBtn.disabled = true;
      try {
        const res = await fetch("/api/company/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, role, password })
        });
        const data = await res.json();
        if (data.success) {
          try {
            let deleted = JSON.parse(localStorage.getItem("buildtrack_deleted_users") || "[]").map(x => x.toLowerCase());
            deleted = deleted.filter(x => x !== email.toLowerCase());
            localStorage.setItem("buildtrack_deleted_users", JSON.stringify(deleted));
          } catch (e) {}

          showFormAlert(alertBox, "success", data.message);
          addTeamMemberForm.reset();
          loadAuthorizedTeam();
          loadProjects();
        } else {
          showFormAlert(alertBox, "error", data.error);
        }
      } catch (err) {
        showFormAlert(alertBox, "error", "Error authorizing team member.");
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  // -------------------------------------------------------------
  // 5. PHOTO MODAL & LIVE CAMERA CAPTURE
  // -------------------------------------------------------------
  const photoModal = document.getElementById("photoModal");
  const closePhotoModalBtn = document.getElementById("closePhotoModalBtn");
  const cancelPhotoModalBtn = document.getElementById("cancelPhotoModalBtn");
  const modalCameraTabBtn = document.getElementById("modalCameraTabBtn");
  const modalUploadTabBtn = document.getElementById("modalUploadTabBtn");
  const modalCameraView = document.getElementById("modalCameraView");
  const modalUploadView = document.getElementById("modalUploadView");
  const modalPreviewView = document.getElementById("modalPreviewView");
  const cameraVideo = document.getElementById("cameraVideo");
  const cameraCanvas = document.getElementById("cameraCanvas");
  const snapPhotoBtn = document.getElementById("snapPhotoBtn");
  const flipCameraBtn = document.getElementById("flipCameraBtn");
  const toggleCameraStreamBtn = document.getElementById("toggleCameraStreamBtn");
  const modalFileInput = document.getElementById("modalFileInput");
  const modalPreviewImg = document.getElementById("modalPreviewImg");
  const retakePhotoBtn = document.getElementById("retakePhotoBtn");
  const useCapturedPhotoBtn = document.getElementById("useCapturedPhotoBtn");
  const photoModalAlert = document.getElementById("photoModalAlert");
  const cameraWatermarkTime = document.getElementById("cameraWatermarkTime");

  const globalCameraBtn = document.getElementById("globalCameraBtn");
  const mobileFabCameraBtn = document.getElementById("mobileFabCameraBtn");

  if (globalCameraBtn) {
    globalCameraBtn.addEventListener("click", () => {
      openPhotoModal(state.currentUser?.role === "builder" ? "builder" : "owner");
    });
  }
  if (mobileFabCameraBtn) {
    mobileFabCameraBtn.addEventListener("click", () => {
      openPhotoModal(state.currentUser?.role === "builder" ? "builder" : "owner");
    });
  }

  const ownerOpenCamBtn = document.getElementById("ownerOpenCamBtn");
  if (ownerOpenCamBtn) ownerOpenCamBtn.addEventListener("click", () => openPhotoModal("owner"));

  const builderOpenCamBtn = document.getElementById("builderOpenCamBtn");
  if (builderOpenCamBtn) builderOpenCamBtn.addEventListener("click", () => openPhotoModal("builder"));

  const ownerFileInput = document.getElementById("ownerFileInput");
  if (ownerFileInput) ownerFileInput.addEventListener("change", (e) => handleDirectFileInput(e, "owner"));

  const builderFileInput = document.getElementById("builderFileInput");
  if (builderFileInput) builderFileInput.addEventListener("change", (e) => handleDirectFileInput(e, "builder"));

  const ownerRemovePhotoBtn = document.getElementById("ownerRemovePhotoBtn");
  if (ownerRemovePhotoBtn) ownerRemovePhotoBtn.addEventListener("click", () => detachPhotoFromForm("owner"));

  const builderRemovePhotoBtn = document.getElementById("builderRemovePhotoBtn");
  if (builderRemovePhotoBtn) builderRemovePhotoBtn.addEventListener("click", () => detachPhotoFromForm("builder"));

  function handleDirectFileInput(e, target) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      attachPhotoToForm(target, event.target.result, file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function openPhotoModal(target) {
    state.activePhotoTarget = target || "owner";
    state.capturedImageBase64 = null;
    if (photoModal) photoModal.classList.remove("hidden");
    switchModalTab("camera");
    startCameraStream();
    updateWatermarkTime();
  }

  function closePhotoModal() {
    stopCameraStream();
    if (photoModal) photoModal.classList.add("hidden");
    state.capturedImageBase64 = null;
  }

  if (closePhotoModalBtn) closePhotoModalBtn.addEventListener("click", closePhotoModal);
  if (cancelPhotoModalBtn) cancelPhotoModalBtn.addEventListener("click", closePhotoModal);

  function switchModalTab(tabName) {
    modalCameraTabBtn.classList.remove("active");
    modalUploadTabBtn.classList.remove("active");
    modalCameraView.classList.add("hidden");
    modalUploadView.classList.add("hidden");
    modalPreviewView.classList.add("hidden");
    useCapturedPhotoBtn.disabled = true;

    if (tabName === "camera") {
      modalCameraTabBtn.classList.add("active");
      modalCameraView.classList.remove("hidden");
      startCameraStream();
    } else if (tabName === "upload") {
      modalUploadTabBtn.classList.add("active");
      modalUploadView.classList.remove("hidden");
      stopCameraStream();
    } else if (tabName === "preview") {
      modalPreviewView.classList.remove("hidden");
      useCapturedPhotoBtn.disabled = false;
      stopCameraStream();
    }
  }

  if (modalCameraTabBtn) modalCameraTabBtn.addEventListener("click", () => switchModalTab("camera"));
  if (modalUploadTabBtn) modalUploadTabBtn.addEventListener("click", () => switchModalTab("upload"));

  async function startCameraStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showAlert(photoModalAlert, "error", "Camera not supported on this browser. Please use File Upload.");
      switchModalTab("upload");
      return;
    }
    try {
      if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(track => track.stop());
      }
      const constraints = {
        video: { facingMode: state.cameraFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      };
      state.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (cameraVideo) {
        cameraVideo.srcObject = state.cameraStream;
        cameraVideo.play();
      }
    } catch (err) {
      showAlert(photoModalAlert, "error", "Camera access denied. Please upload an image instead.");
    }
  }

  function stopCameraStream() {
    if (state.cameraStream) {
      state.cameraStream.getTracks().forEach(track => track.stop());
      state.cameraStream = null;
    }
  }

  function updateWatermarkTime() {
    if (cameraWatermarkTime) {
      cameraWatermarkTime.textContent = new Date().toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
      });
    }
  }

  if (flipCameraBtn) {
    flipCameraBtn.addEventListener("click", () => {
      state.cameraFacingMode = (state.cameraFacingMode === "environment" ? "user" : "environment");
      startCameraStream();
    });
  }

  if (toggleCameraStreamBtn) {
    toggleCameraStreamBtn.addEventListener("click", () => {
      if (state.cameraStream) {
        stopCameraStream();
        toggleCameraStreamBtn.textContent = "Resume Camera";
      } else {
        startCameraStream();
        toggleCameraStreamBtn.textContent = "Pause Camera";
      }
    });
  }

  if (snapPhotoBtn) {
    snapPhotoBtn.addEventListener("click", () => {
      if (!cameraVideo || !cameraCanvas) return;
      const ctx = cameraCanvas.getContext("2d");
      const width = cameraVideo.videoWidth || 1280;
      const height = cameraVideo.videoHeight || 720;
      cameraCanvas.width = width;
      cameraCanvas.height = height;

      ctx.drawImage(cameraVideo, 0, 0, width, height);

      const siteLabel = state.selectedSiteId !== "ALL" ? `• ${state.selectedSiteId}` : "";
      ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
      ctx.fillRect(16, height - 48, 420, 36);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px monospace";
      ctx.fillText(`BuildTrack Pro ${siteLabel} • ${new Date().toLocaleString("en-IN")}`, 24, height - 24);

      const dataUrl = cameraCanvas.toDataURL("image/jpeg", 0.88);
      state.capturedImageBase64 = dataUrl;
      modalPreviewImg.src = dataUrl;
      switchModalTab("preview");
    });
  }

  if (modalFileInput) {
    modalFileInput.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        state.capturedImageBase64 = event.target.result;
        modalPreviewImg.src = event.target.result;
        switchModalTab("preview");
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    });
  }

  if (retakePhotoBtn) retakePhotoBtn.addEventListener("click", () => switchModalTab("camera"));

  if (useCapturedPhotoBtn) {
    useCapturedPhotoBtn.addEventListener("click", () => {
      if (!state.capturedImageBase64) return;
      attachPhotoToForm(state.activePhotoTarget, state.capturedImageBase64, "Verified_Site_Photo.jpg");
      closePhotoModal();
    });
  }

  function attachPhotoToForm(target, base64Data, filename) {
    state.attachedPhotos[target] = { base64: base64Data, filename: filename || "site_photo.jpg" };
    const card = document.getElementById(`${target}AttachedPhotoCard`);
    const thumb = document.getElementById(`${target}AttachedPhotoThumb`);
    const title = document.getElementById(`${target}AttachedPhotoTitle`);
    const inspectBtn = document.getElementById(`${target}InspectPhotoBtn`);
    const previewText = document.getElementById(`${target}PreviewLargeText`);

    if (card && thumb) {
      thumb.src = base64Data;
      if (title) title.textContent = filename || "Site Photo Attached";
      
      const openFn = () => openPhotoLightbox(base64Data, `${filename || 'Site Photo'} (Captured Preview)`);
      thumb.onclick = openFn;
      if (inspectBtn) inspectBtn.onclick = openFn;
      if (previewText) previewText.onclick = openFn;

      card.classList.remove("hidden");
    }
  }

  function detachPhotoFromForm(target) {
    state.attachedPhotos[target] = null;
    const card = document.getElementById(`${target}AttachedPhotoCard`);
    const thumb = document.getElementById(`${target}AttachedPhotoThumb`);
    if (card) card.classList.add("hidden");
    if (thumb) {
      thumb.src = "";
      thumb.onclick = null;
    }
  }

  // -------------------------------------------------------------
  // 6. FULL-SCREEN LIGHTBOX VIEWER
  // -------------------------------------------------------------
  const photoViewerModal = document.getElementById("photoViewerModal");
  const photoViewerImg = document.getElementById("photoViewerImg");
  const photoViewerCaption = document.getElementById("photoViewerCaption");
  const photoViewerDownloadBtn = document.getElementById("photoViewerDownloadBtn");
  const closePhotoViewerBtn = document.getElementById("closePhotoViewerBtn");

  window.openPhotoLightbox = function(photoUrl, caption) {
    if (!photoViewerModal || !photoViewerImg) return;
    photoViewerImg.src = photoUrl;
    if (photoViewerCaption) photoViewerCaption.textContent = caption || "Verified Site Photo Proof";
    if (photoViewerDownloadBtn) {
      photoViewerDownloadBtn.href = photoUrl;
      photoViewerDownloadBtn.download = (caption ? caption.replace(/[^a-zA-Z0-9_-]/g, "_") : "Site_Photo") + ".jpg";
    }
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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && photoViewerModal && !photoViewerModal.classList.contains("hidden")) {
      photoViewerModal.classList.add("hidden");
    }
  });

  // -------------------------------------------------------------
  // 7. OWNER TABS & MOBILE PHONE NAVIGATION
  // -------------------------------------------------------------
  const ownerTabButtons = document.querySelectorAll("#ownerPortal .tab-btn");
  const ownerTabContents = document.querySelectorAll("#ownerPortal .tab-content");

  ownerTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      ownerTabButtons.forEach(b => b.classList.remove("active"));
      ownerTabContents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      const targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add("active");

      if (targetId === "owner-dash-tab" && state.stats) {
        setTimeout(() => renderCharts(state.stats), 60);
      }
      if (targetId === "owner-sites-tab") {
        loadProjects();
      }
      if (targetId === "owner-team-tab") {
        loadAuthorizedTeam();
      }
    });
  });

  const mobileNavBtns = document.querySelectorAll(".mobile-nav-btn[data-target]");
  mobileNavBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      mobileNavBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.target;
      const isOwner = (state.currentUser?.role === "owner");

      if (isOwner) {
        const tabMap = {
          "dash": "owner-dash-tab",
          "form": "owner-form-tab",
          "table": "owner-table-tab",
          "sites": "owner-sites-tab"
        };
        const tabId = tabMap[target] || "owner-dash-tab";
        const tabBtn = document.querySelector(`#ownerPortal .tab-btn[data-tab='${tabId}']`);
        if (tabBtn) tabBtn.click();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  // -------------------------------------------------------------
  // 8. REAL-TIME DATA FETCHING (FILTERED BY ACTIVE SITE)
  // -------------------------------------------------------------
  async function loadAllData() {
    try {
      const siteQuery = (state.selectedSiteId && state.selectedSiteId !== "ALL") ? `?site=${encodeURIComponent(state.selectedSiteId)}` : "";
      const [dataRes, statsRes] = await Promise.all([
        fetch(`/api/data${siteQuery}`),
        fetch(`/api/stats${siteQuery}`)
      ]);
      const dataJson = await dataRes.json();
      const statsJson = await statsRes.json();

      if (dataJson.success) {
        state.records = dataJson.data || [];
        renderMasterTable(state.records);
        renderBuilderRecentTable(state.records);
        renderMilestoneFeeds(state.records);
        const ownerRecordCountBadge = document.getElementById("ownerRecordCountBadge");
        if (ownerRecordCountBadge) ownerRecordCountBadge.textContent = state.records.length;
      }

      if (statsJson.success) {
        state.stats = statsJson;
        renderFinancialKPIs(
          statsJson.summary,
          statsJson.by_work_type,
          statsJson.site_name,
          statsJson.engineer_name,
          statsJson.client_name,
          statsJson.payments_received
        );
        if (state.currentUser?.role === "owner") {
          renderCharts(statsJson);
        }
      }
    } catch (err) {
      console.error("Error syncing data:", err);
    }
  }

  setInterval(() => {
    if (state.currentUser && !document.hidden) {
      loadAllData();
    }
  }, 5000);

  // -------------------------------------------------------------
  // 9. FINANCIAL KPIS & CHARTS
  // -------------------------------------------------------------
  function renderFinancialKPIs(s, byWorkType, siteName, engineerName, clientName, paymentsReceived) {
    if (!s) return;
    const ownerTotalProject = document.getElementById("ownerTotalProjectAmount");
    if (ownerTotalProject) {
      ownerTotalProject.textContent = formatINR(s.total_project_amount);
      document.getElementById("ownerAdvanceReceived").textContent = formatINR(s.advance_received);
      document.getElementById("ownerTotalExpense").textContent = formatINR(s.total_expense);
      document.getElementById("ownerRemainingAdvance").textContent = formatINR(s.remaining_advance_balance);
      document.getElementById("ownerRemainingProjectBalance").textContent = `Overall Balance: ${formatINR(s.remaining_project_balance)}`;
      document.getElementById("ownerEntriesCount").textContent = `${s.total_entries} Logs Recorded`;

      const subElem = document.getElementById("ownerContractSubtitle");
      if (subElem) {
        if (state.selectedSiteId === "ALL") {
          subElem.textContent = "All Active Construction Projects & Clients";
        } else {
          subElem.textContent = `Client: ${clientName || 'Valued Client'} &bull; Engineer: ${engineerName || 'Engineer'}`;
        }
      }

      document.getElementById("sideTotalProject").textContent = formatINR(s.total_project_amount);
      document.getElementById("sideAdvanceReceived").textContent = formatINR(s.advance_received);
      document.getElementById("sideTotalSpent").textContent = formatINR(s.total_expense);
      document.getElementById("sideRemainingAdvance").textContent = formatINR(s.remaining_advance_balance);

      // Render payment mode mini pills in sidebar
      const modeBox = document.getElementById("sidePaymentsModeBreakdown");
      if (modeBox && paymentsReceived && paymentsReceived.by_mode) {
        const bm = paymentsReceived.by_mode;
        modeBox.innerHTML = `
          <span class="pay-mode-pill cash" style="font-size:0.72rem; padding:2px 7px;">Cash: ${formatINR(bm["Cash"] || 0)}</span>
          <span class="pay-mode-pill online" style="font-size:0.72rem; padding:2px 7px;">Online: ${formatINR(bm["Online Payment"] || 0)}</span>
          <span class="pay-mode-pill cheque" style="font-size:0.72rem; padding:2px 7px;">Cheque: ${formatINR(bm["Cheque"] || 0)}</span>
        `;
      }

      const advUsage = s.advance_received > 0 ? ((s.total_expense / s.advance_received) * 100).toFixed(1) : 0;
      const projUsage = s.total_project_amount > 0 ? ((s.total_expense / s.total_project_amount) * 100).toFixed(1) : 0;

      document.getElementById("ownerAdvanceUsageText").textContent = `${advUsage}% of advance used (${formatINR(s.total_expense)} / ${formatINR(s.advance_received)})`;
      document.getElementById("ownerProjectUsageText").textContent = `${projUsage}% of contract (${formatINR(s.total_expense)} / ${formatINR(s.total_project_amount)})`;

      const progBar = document.getElementById("ownerAdvanceProgressBar");
      if (progBar) {
        progBar.style.width = Math.min(advUsage, 100) + "%";
        progBar.style.background = advUsage > 100 ? "linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)" : "linear-gradient(90deg, #10b981 0%, #3b82f6 100%)";
      }

      document.getElementById("ownerMaterialCost").textContent = formatINR(s.total_material_cost);
      document.getElementById("ownerLabourCost").textContent = formatINR(s.total_labour_cost);
      document.getElementById("ownerTotalWorkers").textContent = s.total_workers.toLocaleString("en-IN");
      document.getElementById("ownerCategoriesCount").textContent = Object.keys(byWorkType || {}).length;

      const total = s.total_expense || 1;
      document.getElementById("ownerMaterialPercent").textContent = `${((s.total_material_cost / total) * 100).toFixed(1)}% of spend`;
      document.getElementById("ownerLabourPercent").textContent = `${((s.total_labour_cost / total) * 100).toFixed(1)}% of spend`;
    }
  }

  function renderCharts(stats) {
    if (!window.Chart || !stats) return;
    const byType = stats.by_work_type || {};
    const byMat = stats.by_material || {};
    const timeline = stats.timeline || {};

    const workLabels = Object.keys(byType);
    const matLabels = Object.keys(byMat);
    const timeLabels = Object.keys(timeline);

    // 1. Material Line Chart
    const matCanvas = document.getElementById("ownerMaterialChart");
    if (matCanvas) {
      if (state.charts.ownerMaterial) state.charts.ownerMaterial.destroy();
      state.charts.ownerMaterial = new Chart(matCanvas, {
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

    // 2. Stacked Work Category Bar
    const catCanvas = document.getElementById("ownerCategoryChart");
    if (catCanvas) {
      if (state.charts.ownerCategory) state.charts.ownerCategory.destroy();
      state.charts.ownerCategory = new Chart(catCanvas, {
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

    // 3. Labour Wages Horizontal Bar
    const labCanvas = document.getElementById("ownerLabourChart");
    if (labCanvas) {
      if (state.charts.ownerLabour) state.charts.ownerLabour.destroy();
      state.charts.ownerLabour = new Chart(labCanvas, {
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

    // 4. Manpower Deployed Bar
    const workCanvas = document.getElementById("ownerWorkersChart");
    if (workCanvas) {
      if (state.charts.ownerWorkers) state.charts.ownerWorkers.destroy();
      state.charts.ownerWorkers = new Chart(workCanvas, {
        type: "bar",
        data: {
          labels: workLabels,
          datasets: [{ label: "Workers Deployed", data: workLabels.map(k => byType[k].worker_count), backgroundColor: "#f59e0b", borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // 5. Daily Timeline
    const timeCanvas = document.getElementById("ownerTimelineChart");
    if (timeCanvas) {
      if (state.charts.ownerTimeline) state.charts.ownerTimeline.destroy();
      state.charts.ownerTimeline = new Chart(timeCanvas, {
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

  // -------------------------------------------------------------
  // 10. MASTER TABLES & FEEDS
  // -------------------------------------------------------------
  function renderMasterTable(records) {
    const tableBody = document.getElementById("ownerTableBody");
    const tableFoot = document.getElementById("ownerTableFoot");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (!records || records.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="16" style="text-align:center; padding: 24px; color: var(--text-muted);">No records found for active site filter.</td></tr>`;
      if (tableFoot) {
        tableFoot.innerHTML = `<tr><td colspan="7" class="bold-cell text-right">TOTALS:</td><td class="mono-cell text-right bold-cell">Rs. 0.00</td><td></td><td class="mono-cell text-right bold-cell">0</td><td class="mono-cell text-right bold-cell">Rs. 0.00</td><td></td><td></td><td class="mono-cell text-right total-cell">Rs. 0.00</td><td colspan="2"></td></tr>`;
      }
      return;
    }

    let sumMat = 0, sumLab = 0, sumTot = 0, sumWorkers = 0;
    records.forEach(r => {
      const expId = r["Expense ID"] || "-";
      const siteId = r["Site ID"] || "-";
      const siteName = r["Site Name"] || "-";
      const date = r["Date"] || "-";
      const matName = r["Material Name"] || "-";
      const qty = r["Quantity"] ? Number(r["Quantity"]).toLocaleString() : "-";
      const unit = r["Unit"] || "-";
      const matCost = cleanNumber(r["Material Cost (INR)"]);
      const workType = r["Labour/Work Type"] || "-";
      const numWorkers = parseInt(r["Number of Workers"]) || 0;
      const labCost = cleanNumber(r["Labour Cost (INR)"]);
      const payMode = r["Payment Mode"] || "Cash";
      const desc = r["Brief Description"] || "-";
      const total = cleanNumber(r["Total Expense (INR)"]) || (matCost + labCost);
      const photoUrl = r["Site Photo"] || "";

      sumMat += matCost; sumWorkers += numWorkers; sumLab += labCost; sumTot += total;

      let badgeClass = "badge-cash";
      if (payMode === "Online Payment") badgeClass = "badge-online";
      else if (payMode === "Cheque") badgeClass = "badge-cheque";
      const payModeHtml = `<span class="badge-pay-mode ${badgeClass}">${payMode}</span>`;

      const photoCellHtml = (photoUrl && photoUrl !== "-")
        ? `<img src="${photoUrl}" class="table-photo-thumb" alt="${expId}" onclick="openPhotoLightbox('${photoUrl}', '${expId} (${siteId}): ${workType}')" title="Click to view full photo">`
        : `<span class="no-photo-badge">No Photo</span>`;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="mono-cell bold-cell text-center">${expId}</td>
        <td class="text-center"><span class="site-code-badge">${siteId}</span></td>
        <td style="max-width:140px; overflow:hidden; text-overflow:ellipsis;">${siteName}</td>
        <td class="mono-cell text-center">${date}</td>
        <td>${matName}</td>
        <td class="mono-cell text-right">${qty}</td>
        <td class="text-center">${unit}</td>
        <td class="mono-cell text-right bold-cell">${matCost > 0 ? formatINR(matCost) : "Rs. 0.00"}</td>
        <td class="bold-cell">${workType}</td>
        <td class="mono-cell text-right">${numWorkers > 0 ? numWorkers : "-"}</td>
        <td class="mono-cell text-right">${labCost > 0 ? formatINR(labCost) : "Rs. 0.00"}</td>
        <td class="text-center">${payModeHtml}</td>
        <td style="max-width: 200px; white-space: normal;">${desc}</td>
        <td class="mono-cell text-right total-cell">${formatINR(total)}</td>
        <td class="text-center">${photoCellHtml}</td>
        <td class="text-center"><button class="btn-danger-sm" data-id="${expId}">Delete</button></td>
      `;
      row.querySelector(".btn-danger-sm").addEventListener("click", () => handleDelete(expId));
      tableBody.appendChild(row);
    });

    if (tableFoot) {
      tableFoot.innerHTML = `<tr><td colspan="7" class="bold-cell text-right">TOTALS:</td><td class="mono-cell text-right bold-cell">${formatINR(sumMat)}</td><td></td><td class="mono-cell text-right bold-cell">${sumWorkers}</td><td class="mono-cell text-right bold-cell">${formatINR(sumLab)}</td><td></td><td></td><td class="mono-cell text-right total-cell">${formatINR(sumTot)}</td><td colspan="2"></td></tr>`;
    }
  }

  function renderBuilderRecentTable(records) {
    const bBody = document.getElementById("builderRecentTableBody");
    if (!bBody) return;
    bBody.innerHTML = "";

    if (!records || records.length === 0) {
      bBody.innerHTML = `<tr><td colspan="14" style="text-align:center; padding: 20px; color: var(--text-muted);">No site logs recorded yet for this site.</td></tr>`;
      return;
    }

    [...records].reverse().slice(0, 10).forEach(r => {
      const expId = r["Expense ID"] || "-";
      const siteId = r["Site ID"] || "-";
      const date = r["Date"] || "-";
      const matName = r["Material Name"] || "-";
      const qty = r["Quantity"] ? Number(r["Quantity"]).toLocaleString() : "-";
      const unit = r["Unit"] || "-";
      const matCost = cleanNumber(r["Material Cost (INR)"]);
      const workType = r["Labour/Work Type"] || "-";
      const numWorkers = parseInt(r["Number of Workers"]) || 0;
      const labCost = cleanNumber(r["Labour Cost (INR)"]);
      const payMode = r["Payment Mode"] || "Cash";
      const desc = r["Brief Description"] || "-";
      const total = cleanNumber(r["Total Expense (INR)"]) || (matCost + labCost);
      const photoUrl = r["Site Photo"] || "";

      let badgeClass = "badge-cash";
      if (payMode === "Online Payment") badgeClass = "badge-online";
      else if (payMode === "Cheque") badgeClass = "badge-cheque";
      const payModeHtml = `<span class="badge-pay-mode ${badgeClass}">${payMode}</span>`;

      const photoCellHtml = (photoUrl && photoUrl !== "-")
        ? `<img src="${photoUrl}" class="table-photo-thumb" alt="${expId}" onclick="openPhotoLightbox('${photoUrl}', '${expId} (${siteId}): ${workType}')" title="Click to view full photo">`
        : `<span class="no-photo-badge">No Photo</span>`;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td class="mono-cell bold-cell text-center">${expId}</td>
        <td class="text-center"><span class="site-code-badge">${siteId}</span></td>
        <td class="mono-cell text-center">${date}</td>
        <td>${matName}</td>
        <td class="mono-cell text-right">${qty}</td>
        <td class="text-center">${unit}</td>
        <td class="mono-cell text-right bold-cell">${formatINR(matCost)}</td>
        <td class="bold-cell">${workType}</td>
        <td class="mono-cell text-right">${numWorkers > 0 ? numWorkers : "-"}</td>
        <td class="mono-cell text-right">${formatINR(labCost)}</td>
        <td class="text-center">${payModeHtml}</td>
        <td style="max-width: 200px; white-space: normal;">${desc}</td>
        <td class="mono-cell text-right total-cell">${formatINR(total)}</td>
        <td class="text-center">${photoCellHtml}</td>
      `;
      bBody.appendChild(row);
    });
  }

  function renderMilestoneFeeds(records) {
    const ownerFeed = document.getElementById("ownerFeedList");
    if (!ownerFeed) return;

    if (!records || records.length === 0) {
      ownerFeed.innerHTML = `<p style="color: var(--text-muted); padding: 24px; text-align: center;">No verified milestone entries or site photos logged yet for this construction project.</p>`;
      return;
    }

    ownerFeed.innerHTML = [...records].reverse().map(r => {
      const expId = r["Expense ID"] || "-";
      const siteId = r["Site ID"] || "";
      const siteName = r["Site Name"] || "";
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
        ? `<img src="${photoUrl}" class="feed-photo-thumb" alt="${expId}" onclick="openPhotoLightbox('${photoUrl}', '${expId} (${siteId}): ${workType}')" title="Click to view full photo">`
        : "";

      return `
        <div class="feed-item">
          <div class="feed-tag">${workType}</div>
          <div class="feed-body">
            <div class="feed-title-row">
              <h4 class="feed-title">${expId} [${siteId}]: ${workType}</h4>
              <span class="feed-date">${date}</span>
            </div>
            <p class="feed-desc">${desc}</p>
            ${photoHtml}
            <div class="feed-meta">
              ${siteName ? `<span style="font-weight:700; color:#2563eb;">Site: ${siteName}</span>` : ""}
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

  const ownerSearch = document.getElementById("ownerTableSearch");
  if (ownerSearch) {
    ownerSearch.addEventListener("input", (e) => {
      const q = e.target.value.toLowerCase().trim();
      renderMasterTable(state.records.filter(r => JSON.stringify(r).toLowerCase().includes(q)));
    });
  }

  // -------------------------------------------------------------
  // 11. FORMS & LIVE CALCULATION
  // -------------------------------------------------------------
  function initBuilderFormDefaults() {
    const bDate = document.getElementById("builderEntryDate");
    const bExpId = document.getElementById("builderExpId");
    if (bDate) bDate.value = new Date().toISOString().split("T")[0];

    // Set site select first
    if (builderFormSiteSelect && state.selectedSiteId && state.selectedSiteId !== "ALL") {
      builderFormSiteSelect.value = state.selectedSiteId;
    }

    // Get the ACTUAL site from the form dropdown (most reliable source)
    const actualSite = builderFormSiteSelect?.value || state.selectedSiteId;
    const siteParam = (actualSite && actualSite !== "ALL") ? `?site=${encodeURIComponent(actualSite)}` : "";
    fetch(`/api/next-id${siteParam}`).then(r => r.json()).then(d => {
      if (d.next_id && bExpId) bExpId.value = d.next_id;
    });

    detachPhotoFromForm("builder");
    updateBuilderPreview();
  }

  if (builderFormSiteSelect) {
    builderFormSiteSelect.addEventListener("change", () => {
      const sId = builderFormSiteSelect.value;
      const bExpId = document.getElementById("builderExpId");
      const siteParam = (sId && sId !== "ALL") ? `?site=${encodeURIComponent(sId)}` : "";
      fetch(`/api/next-id${siteParam}`).then(r => r.json()).then(d => { if (d.next_id && bExpId) bExpId.value = d.next_id; });
    });
  }

  const bQty = document.getElementById("builderQty");
  const bRate = document.getElementById("builderUnitRate");
  const bMatCost = document.getElementById("builderMatCost");
  const bWorkers = document.getElementById("builderWorkers");
  const bWage = document.getElementById("builderWage");
  const bLabCost = document.getElementById("builderLabCost");

  function autoCalcBuilderMat() {
    const q = cleanNumber(bQty?.value);
    const r = cleanNumber(bRate?.value);
    if (q > 0 && r > 0 && bMatCost) bMatCost.value = (q * r).toFixed(2);
    updateBuilderPreview();
  }

  function autoCalcBuilderLab() {
    const w = Math.floor(cleanNumber(bWorkers?.value));
    const wage = cleanNumber(bWage?.value);
    if (w > 0 && wage > 0 && bLabCost) bLabCost.value = (w * wage).toFixed(2);
    updateBuilderPreview();
  }

  function updateBuilderPreview() {
    const mat = cleanNumber(bMatCost?.value);
    const lab = cleanNumber(bLabCost?.value);
    const pMat = document.getElementById("builderPreviewMatCost");
    const pLab = document.getElementById("builderPreviewLabCost");
    const pTot = document.getElementById("builderPreviewTotalCost");
    if (pMat) pMat.textContent = formatINR(mat);
    if (pLab) pLab.textContent = formatINR(lab);
    if (pTot) pTot.textContent = formatINR(mat + lab);
  }

  if (bQty) bQty.addEventListener("input", autoCalcBuilderMat);
  if (bRate) bRate.addEventListener("input", autoCalcBuilderMat);
  if (bMatCost) bMatCost.addEventListener("input", updateBuilderPreview);
  if (bWorkers) bWorkers.addEventListener("input", autoCalcBuilderLab);
  if (bWage) bWage.addEventListener("input", autoCalcBuilderLab);
  if (bLabCost) bLabCost.addEventListener("input", updateBuilderPreview);

  const builderForm = document.getElementById("builderExpenseForm");
  if (builderForm) {
    builderForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const sId = document.getElementById("builderFormSiteSelect")?.value || state.selectedSiteId;
      const sObj = state.projects.find(p => p.site_id === sId) || {};
      handleFormSubmit({
        formRole: "builder",
        form: builderForm,
        siteId: sId,
        siteName: sObj.site_name || "Construction Site",
        expId: document.getElementById("builderExpId")?.value,
        date: document.getElementById("builderEntryDate")?.value,
        matName: document.getElementById("builderMatName")?.value,
        qty: cleanNumber(bQty?.value),
        unit: document.getElementById("builderUnit")?.value,
        unitRate: cleanNumber(bRate?.value),
        matCostInput: bMatCost,
        workType: document.getElementById("builderWorkType")?.value,
        workers: Math.floor(cleanNumber(bWorkers?.value)),
        wage: cleanNumber(bWage?.value),
        labCostInput: bLabCost,
        paymentMode: document.getElementById("builderPaymentMode")?.value || "Cash",
        desc: document.getElementById("builderDesc")?.value,
        submitBtn: document.getElementById("builderSubmitBtn"),
        alertBox: document.getElementById("builderFormAlert"),
        resetFn: initBuilderFormDefaults
      });
    });
  }

  function initOwnerFormDefaults() {
    const oDate = document.getElementById("ownerEntryDate");
    const oExpId = document.getElementById("ownerExpId");
    if (oDate) oDate.value = new Date().toISOString().split("T")[0];

    // Set site select first
    if (ownerFormSiteSelect && state.selectedSiteId && state.selectedSiteId !== "ALL") {
      ownerFormSiteSelect.value = state.selectedSiteId;
    }

    // Get the ACTUAL site from the form dropdown (most reliable source)
    const actualSite = ownerFormSiteSelect?.value || state.selectedSiteId;
    const siteParam = (actualSite && actualSite !== "ALL") ? `?site=${encodeURIComponent(actualSite)}` : "";
    fetch(`/api/next-id${siteParam}`).then(r => r.json()).then(d => {
      if (d.next_id && oExpId) oExpId.value = d.next_id;
    });

    detachPhotoFromForm("owner");
    updateOwnerPreview();
  }

  if (ownerFormSiteSelect) {
    ownerFormSiteSelect.addEventListener("change", () => {
      const sId = ownerFormSiteSelect.value;
      const oExpId = document.getElementById("ownerExpId");
      const siteParam = (sId && sId !== "ALL") ? `?site=${encodeURIComponent(sId)}` : "";
      fetch(`/api/next-id${siteParam}`).then(r => r.json()).then(d => { if (d.next_id && oExpId) oExpId.value = d.next_id; });
    });
  }

  const oQty = document.getElementById("ownerQty");
  const oRate = document.getElementById("ownerUnitRate");
  const oMatCost = document.getElementById("ownerMatCost");
  const oWorkers = document.getElementById("ownerWorkers");
  const oWage = document.getElementById("ownerWage");
  const oLabCost = document.getElementById("ownerLabCost");

  function autoCalcOwnerMat() {
    const q = cleanNumber(oQty?.value);
    const r = cleanNumber(oRate?.value);
    if (q > 0 && r > 0 && oMatCost) oMatCost.value = (q * r).toFixed(2);
    updateOwnerPreview();
  }

  function autoCalcOwnerLab() {
    const w = Math.floor(cleanNumber(oWorkers?.value));
    const wage = cleanNumber(oWage?.value);
    if (w > 0 && wage > 0 && oLabCost) oLabCost.value = (w * wage).toFixed(2);
    updateOwnerPreview();
  }

  function updateOwnerPreview() {
    const mat = cleanNumber(oMatCost?.value);
    const lab = cleanNumber(oLabCost?.value);
    const pMat = document.getElementById("ownerPreviewMatCost");
    const pLab = document.getElementById("ownerPreviewLabCost");
    const pTot = document.getElementById("ownerPreviewTotalCost");
    if (pMat) pMat.textContent = formatINR(mat);
    if (pLab) pLab.textContent = formatINR(lab);
    if (pTot) pTot.textContent = formatINR(mat + lab);
  }

  if (oQty) oQty.addEventListener("input", autoCalcOwnerMat);
  if (oRate) oRate.addEventListener("input", autoCalcOwnerMat);
  if (oMatCost) oMatCost.addEventListener("input", updateOwnerPreview);
  if (oWorkers) oWorkers.addEventListener("input", autoCalcOwnerLab);
  if (oWage) oWage.addEventListener("input", autoCalcOwnerLab);
  if (oLabCost) oLabCost.addEventListener("input", updateOwnerPreview);

  const ownerForm = document.getElementById("ownerExpenseForm");
  if (ownerForm) {
    ownerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const sId = document.getElementById("ownerFormSiteSelect")?.value || state.selectedSiteId;
      const sObj = state.projects.find(p => p.site_id === sId) || {};
      handleFormSubmit({
        formRole: "owner",
        form: ownerForm,
        siteId: sId,
        siteName: sObj.site_name || "Construction Site",
        expId: document.getElementById("ownerExpId")?.value,
        date: document.getElementById("ownerEntryDate")?.value,
        matName: document.getElementById("ownerMatName")?.value,
        qty: cleanNumber(oQty?.value),
        unit: document.getElementById("ownerUnit")?.value,
        unitRate: cleanNumber(oRate?.value),
        matCostInput: oMatCost,
        workType: document.getElementById("ownerWorkType")?.value,
        workers: Math.floor(cleanNumber(oWorkers?.value)),
        wage: cleanNumber(oWage?.value),
        labCostInput: oLabCost,
        paymentMode: document.getElementById("ownerPaymentMode")?.value || "Cash",
        desc: document.getElementById("ownerDesc")?.value,
        submitBtn: document.getElementById("ownerSubmitBtn"),
        alertBox: document.getElementById("ownerFormAlert"),
        resetFn: initOwnerFormDefaults
      });
    });
  }

  async function handleFormSubmit({ formRole, form, siteId, siteName, expId, date, matName, qty, unit, unitRate, matCostInput, workType, workers, wage, labCostInput, paymentMode, desc, submitBtn, alertBox, resetFn }) {
    let matCost = cleanNumber(matCostInput?.value);
    let labCost = cleanNumber(labCostInput?.value);

    if (matCost === 0 && qty > 0 && unitRate > 0) {
      matCost = qty * unitRate;
      if (matCostInput) matCostInput.value = matCost.toFixed(2);
    }
    if (labCost === 0 && workers > 0 && wage > 0) {
      labCost = workers * wage;
      if (labCostInput) labCostInput.value = labCost.toFixed(2);
    }

    if (matCost === 0 && labCost === 0) {
      showFormAlert(alertBox, "error", "Please enter Material Cost or Labour Cost.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.innerText = "Saving to Excel...";

    let finalPhotoUrl = "";
    if (state.attachedPhotos[formRole]?.base64) {
      try {
        const uploadRes = await fetch("/api/upload-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: state.attachedPhotos[formRole].base64 })
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.url) {
          finalPhotoUrl = uploadData.url;
        }
      } catch (err) {
        console.warn("Could not upload photo:", err);
      }
    }

    const payload = {
      "Expense ID": expId?.trim() || undefined,
      "Site ID": siteId || "SITE-101",
      "Site Name": siteName || "Construction Site",
      "Date": date || undefined,
      "Material Name": matName?.trim() || "",
      "Quantity": qty,
      "Unit": unit || "",
      "Material Cost (INR)": matCost,
      "Labour/Work Type": workType?.trim() || "General Site Work",
      "Number of Workers": workers,
      "Labour Cost (INR)": labCost,
      "Payment Mode": paymentMode || "Cash",
      "Brief Description": desc?.trim() || "",
      "Total Expense (INR)": matCost + labCost,
      "Site Photo": finalPhotoUrl
    };

    try {
      const res = await fetch("/api/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showFormAlert(alertBox, "success", data.message);
        form.reset();
        resetFn();
        await loadAllData();
      } else {
        showFormAlert(alertBox, "error", data.error || "Error saving record.");
      }
    } catch (err) {
      showFormAlert(alertBox, "error", "Network error saving to Excel.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerText = "Save & Add to Excel";
    }
  }

  function showFormAlert(box, type, msg) {
    if (!box) return;
    box.className = `alert-box ${type}`;
    box.textContent = msg;
    box.classList.remove("hidden");
    setTimeout(() => box.classList.add("hidden"), 4000);
  }

  async function handleDelete(expId) {
    if (!confirm(`Delete record ${expId} from Excel?`)) return;
    try {
      const res = await fetch(`/api/entry/${expId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
      }
    } catch (err) { console.error("Delete error:", err); }
  }

  // -------------------------------------------------------------
  // 12. PROJECT BUDGET & CLIENT PAYMENTS MODAL (CASH, ONLINE, CHEQUE)
  // -------------------------------------------------------------
  const budgetPaymentsModal = document.getElementById("budgetPaymentsModal");
  const closeBudgetModalBtn = document.getElementById("closeBudgetModalBtn");
  const doneBudgetModalBtn = document.getElementById("doneBudgetModalBtn");
  const recordPaymentForm = document.getElementById("recordPaymentForm");
  const bmSavePaymentBtn = document.getElementById("bmSavePaymentBtn");
  const bmCancelEditBtn = document.getElementById("bmCancelEditBtn");
  const bmPaymentAlert = document.getElementById("bmPaymentAlert");
  const bmSaveContractBtn = document.getElementById("bmSaveContractBtn");

  window.openProjectBudgetModal = function(siteId) {
    const targetSite = siteId || (state.selectedSiteId && state.selectedSiteId !== "ALL" ? state.selectedSiteId : (state.projects[0]?.site_id || "SITE-101"));
    state.activeBudgetModalSite = targetSite;

    const proj = state.projects.find(p => p.site_id === targetSite) || {};
    const titleElem = document.getElementById("budgetModalSiteTitle");
    const subElem = document.getElementById("budgetModalSiteSubtitle");
    if (titleElem) titleElem.textContent = `[${targetSite}] ${proj.site_name || 'Construction Project'} - Budget & Client Payments`;
    if (subElem) subElem.textContent = `Client: ${proj.client_name || 'Client'} • Assigned Engineer: ${proj.engineer_name || 'Engineer'}`;

    resetPaymentForm();

    const editContractInput = document.getElementById("bmEditContractAmount");
    if (editContractInput) editContractInput.value = proj.total_contract_amount || 1500000;

    if (budgetPaymentsModal) budgetPaymentsModal.classList.remove("hidden");
    refreshBudgetModalData(targetSite);
  };

  const editBudgetBtn = document.getElementById("editBudgetBtn");
  if (editBudgetBtn) {
    editBudgetBtn.addEventListener("click", () => {
      if (!state.selectedSiteId || state.selectedSiteId === "ALL") {
        if (state.projects.length > 0) {
          window.openProjectBudgetModal(state.projects[0].site_id);
        } else {
          alert("Please register a construction project first.");
        }
        return;
      }
      window.openProjectBudgetModal(state.selectedSiteId);
    });
  }

  function closeBudgetModal() {
    if (budgetPaymentsModal) budgetPaymentsModal.classList.add("hidden");
    loadProjects().then(() => loadAllData());
  }

  if (closeBudgetModalBtn) closeBudgetModalBtn.addEventListener("click", closeBudgetModal);
  if (doneBudgetModalBtn) doneBudgetModalBtn.addEventListener("click", closeBudgetModal);

  function resetPaymentForm() {
    if (recordPaymentForm) recordPaymentForm.reset();
    const payIdInput = document.getElementById("bmPaymentId");
    if (payIdInput) payIdInput.value = "";
    const payDateInput = document.getElementById("bmPayDate");
    if (payDateInput) payDateInput.value = new Date().toISOString().split("T")[0];
    const formTitle = document.getElementById("bmFormTitle");
    if (formTitle) formTitle.textContent = "Record Client Payment / Advance";
    if (bmSavePaymentBtn) bmSavePaymentBtn.textContent = "Record Payment";
    if (bmCancelEditBtn) bmCancelEditBtn.classList.add("hidden");
    if (bmPaymentAlert) bmPaymentAlert.classList.add("hidden");
  }

  if (bmCancelEditBtn) {
    bmCancelEditBtn.addEventListener("click", resetPaymentForm);
  }

  async function refreshBudgetModalData(siteId) {
    try {
      const [statsRes, payRes] = await Promise.all([
        fetch(`/api/stats?site=${encodeURIComponent(siteId)}`),
        fetch(`/api/projects/${encodeURIComponent(siteId)}/payments`)
      ]);
      const stats = await statsRes.json();
      const payData = await payRes.json();

      if (stats.success) {
        const s = stats.summary;
        document.getElementById("bmTotalContract").textContent = formatINR(s.total_project_amount);
        document.getElementById("bmAdvanceReceived").textContent = formatINR(s.advance_received);
        document.getElementById("bmTotalSpent").textContent = formatINR(s.total_expense);
        document.getElementById("bmRemainingAdvance").textContent = formatINR(s.remaining_advance_balance);

        const byMode = stats.payments_received?.by_mode || {};
        document.getElementById("bmPillCash").textContent = `Cash: ${formatINR(byMode["Cash"] || 0)}`;
        document.getElementById("bmPillOnline").textContent = `Online Payment: ${formatINR(byMode["Online Payment"] || 0)}`;
        document.getElementById("bmPillCheque").textContent = `Cheque: ${formatINR(byMode["Cheque"] || 0)}`;
      }

      renderBudgetModalPaymentsTable(payData.payments || []);
    } catch (err) {
      console.error("Error refreshing budget modal data:", err);
    }
  }

  function renderBudgetModalPaymentsTable(payments) {
    const tbody = document.getElementById("bmPaymentsTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!payments || payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:16px; color:#64748b;">No client payments recorded yet for this project.</td></tr>`;
      return;
    }

    payments.forEach(p => {
      let badgeClass = "badge-cash";
      if (p.mode === "Online Payment") badgeClass = "badge-online";
      else if (p.mode === "Cheque") badgeClass = "badge-cheque";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono-cell" style="font-weight:700;">${p.id || '-'}</td>
        <td class="mono-cell">${formatDate(p.date)}</td>
        <td><span class="badge-pay-mode ${badgeClass}">${p.mode || 'Cash'}</span></td>
        <td style="color:#475569;">${p.notes || '-'}</td>
        <td class="mono-cell" style="text-align:right; font-weight:700; color:#059669;">${formatINR(p.amount)}</td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:6px;">
            <button type="button" class="btn-xs" style="background:#3b82f6; color:#fff; border:none;" onclick="window.editClientPayment('${p.id}', ${p.amount}, '${p.mode}', '${p.date}', '${encodeURIComponent(p.notes || '')}')">Edit</button>
            <button type="button" class="btn-xs" style="background:#fff; color:#ef4444; border:1px solid #fca5a5;" onclick="window.deleteClientPayment('${p.id}')">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // RECORD / EDIT CLIENT PAYMENT FORM SUBMIT
  if (recordPaymentForm) {
    recordPaymentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const siteId = state.activeBudgetModalSite || state.selectedSiteId;
      const paymentId = document.getElementById("bmPaymentId")?.value.trim();
      const amount = cleanNumber(document.getElementById("bmPayAmount")?.value);
      const mode = document.getElementById("bmPayMode")?.value;
      const date = document.getElementById("bmPayDate")?.value;
      const notes = document.getElementById("bmPayNotes")?.value.trim();

      if (amount <= 0) {
        showFormAlert(bmPaymentAlert, "error", "Please enter a valid payment amount.");
        return;
      }

      bmSavePaymentBtn.disabled = true;
      bmSavePaymentBtn.innerText = "Saving Payment...";

      try {
        const url = paymentId
          ? `/api/projects/${encodeURIComponent(siteId)}/payments/${encodeURIComponent(paymentId)}`
          : `/api/projects/${encodeURIComponent(siteId)}/payments`;
        const method = paymentId ? "PUT" : "POST";

        const res = await fetch(url, {
          method: method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount, mode, date, notes })
        });
        const data = await res.json();
        if (data.success) {
          showFormAlert(bmPaymentAlert, "success", data.message);
          resetPaymentForm();
          await refreshBudgetModalData(siteId);
          await loadProjects();
          await loadAllData();
        } else {
          showFormAlert(bmPaymentAlert, "error", data.error || "Could not save payment.");
        }
      } catch (err) {
        showFormAlert(bmPaymentAlert, "error", "Network error saving payment.");
      } finally {
        bmSavePaymentBtn.disabled = false;
        bmSavePaymentBtn.innerText = paymentId ? "Update Payment" : "Record Payment";
      }
    });
  }

  window.editClientPayment = function(id, amount, mode, date, encodedNotes) {
    const payIdInput = document.getElementById("bmPaymentId");
    const payAmountInput = document.getElementById("bmPayAmount");
    const payModeSelect = document.getElementById("bmPayMode");
    const payDateInput = document.getElementById("bmPayDate");
    const payNotesInput = document.getElementById("bmPayNotes");
    const formTitle = document.getElementById("bmFormTitle");

    if (payIdInput) payIdInput.value = id;
    if (payAmountInput) payAmountInput.value = amount;
    if (payModeSelect) payModeSelect.value = mode || "Online Payment";
    if (payDateInput && date) payDateInput.value = date;
    if (payNotesInput) payNotesInput.value = decodeURIComponent(encodedNotes || "");

    if (formTitle) formTitle.textContent = `Edit Payment (${id})`;
    if (bmSavePaymentBtn) bmSavePaymentBtn.textContent = "Update Payment";
    if (bmCancelEditBtn) bmCancelEditBtn.classList.remove("hidden");

    payAmountInput?.focus();
  };

  window.deleteClientPayment = async function(paymentId) {
    if (!confirm(`Delete payment record ${paymentId}?`)) return;
    const siteId = state.activeBudgetModalSite || state.selectedSiteId;
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(siteId)}/payments/${encodeURIComponent(paymentId)}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (data.success) {
        showFormAlert(bmPaymentAlert, "success", data.message);
        await refreshBudgetModalData(siteId);
        await loadProjects();
        await loadAllData();
      } else {
        showFormAlert(bmPaymentAlert, "error", data.error || "Could not delete payment.");
      }
    } catch (err) {
      showFormAlert(bmPaymentAlert, "error", "Network error deleting payment.");
    }
  };

  // UPDATE TOTAL CONTRACT BUDGET AMOUNT
  if (bmSaveContractBtn) {
    bmSaveContractBtn.addEventListener("click", async () => {
      const siteId = state.activeBudgetModalSite || state.selectedSiteId;
      const newContract = cleanNumber(document.getElementById("bmEditContractAmount")?.value);
      if (newContract <= 0) {
        alert("Please enter a valid contract amount.");
        return;
      }

      bmSaveContractBtn.disabled = true;
      bmSaveContractBtn.innerText = "Updating...";

      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(siteId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ total_contract_amount: newContract })
        });
        const data = await res.json();
        if (data.success) {
          alert(`Total Contract Budget updated to ${formatINR(newContract)} for ${siteId}.`);
          await refreshBudgetModalData(siteId);
          await loadProjects();
          await loadAllData();
        } else {
          alert("Error: " + data.error);
        }
      } catch (err) {
        alert("Network error updating contract budget.");
      } finally {
        bmSaveContractBtn.disabled = false;
        bmSaveContractBtn.innerText = "Update Contract";
      }
    });
  }

  loadProjects().then(() => loadAllData());
});