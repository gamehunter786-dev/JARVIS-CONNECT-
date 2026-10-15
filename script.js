const firebaseConfig = {
  Project_Details

const $ = id => document.getElementById(id);

const statusText = $("status");
const authPanel = $("authPanel");
const profilePanel = $("chatPanel");
const authForm = $("authForm");
const authTitle = $("authTitle");
const authSubtitle = $("authSubtitle");
const authError = $("authError");
const usernameGroup = $("usernameGroup");
const usernameInput = $("usernameInput");
const emailInput = $("emailInput");
const passwordInput = $("passwordInput");
const authSubmit = $("authSubmit");
const loginTab = $("loginTab");
const registerTab = $("registerTab");
const profileUsername = $("profileUsername");
const profileEmail = $("profileEmail");
const logoutBtn = $("logoutBtn");
const messages = $("messages");
const chatForm = $("chatForm");
const messageInput = $("messageInput");
const sendBtn = $("sendBtn");

let auth;
let db;
let authApi;
let dbApi;
let currentUser = null;
let currentUsername = "";
let mode = "login";
let busy = false;
let registering = false;
let sending = false;
let stopMessages = null;
let sessionVersion = 0;

function explainError(error) {
  console.error("JARVIS Firebase Error:", error);

  return `Error code: ${error.code || "unknown"} — ${
    error.message || "Unknown error"
  }`;
}

function setMode(nextMode) {
  mode = nextMode;
  const isRegister = mode === "register";

  authTitle.textContent = isRegister
    ? "Create Your Account"
    : "Welcome, Agent";

  authSubtitle.textContent = isRegister
    ? "Choose your unique agent username."
    : "Sign in to connect to the network.";

  authSubmit.textContent = isRegister
    ? "Create Account"
    : "Sign In";

  usernameGroup.hidden = !isRegister;
  usernameInput.required = isRegister;

  passwordInput.autocomplete = isRegister
    ? "new-password"
    : "current-password";

  loginTab.classList.toggle("active", !isRegister);
  registerTab.classList.toggle("active", isRegister);
  authError.textContent = "";
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

function showWelcome(title, subtitle) {
  messages.replaceChildren();

  const box = document.createElement("div");
  box.className = "welcome";

  const icon = document.createElement("div");
  icon.className = "welcome-icon";
  icon.textContent = "✦";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const paragraph = document.createElement("p");
  paragraph.textContent = subtitle;

  box.append(icon, heading, paragraph);
  messages.appendChild(box);
}

function showMessage(data, user, version) {
  if (
    !data ||
    version !== sessionVersion ||
    currentUser?.uid !== user.uid
  ) return;

  messages.querySelector(".welcome")?.remove();

  const bubble = document.createElement("div");
  bubble.className = "message";

  if (data.uid === user.uid) {
    bubble.classList.add("sent");
  }

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = data.name || "Agent";

  const body = document.createElement("div");
  body.className = "text";
  body.textContent = data.text || "";

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = data.createdAt
    ? new Date(data.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Just now";

  bubble.append(name, body, time);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

function stopChat() {
  sessionVersion++;

  if (stopMessages) stopMessages();
  stopMessages = null;

  currentUser = null;
  currentUsername = "";

  profilePanel.hidden = true;
  chatForm.hidden = true;
  sendBtn.disabled = true;

  showWelcome("Welcome, Agent!", "Sign in to connect to the network.");
}

async function openChat(user, username) {
  if (auth.currentUser?.uid !== user.uid) return;

  if (stopMessages) stopMessages();
  stopMessages = null;

  const version = ++sessionVersion;

  currentUser = user;
  currentUsername = username;

  authPanel.hidden = true;
  profilePanel.hidden = false;
  chatForm.hidden = false;

  profileUsername.textContent = username;
  profileEmail.textContent = user.email || "";

  showWelcome("Welcome, " + username + "!", "Loading messages...");
  statusText.textContent = "ONLINE";
  authError.textContent = "";

  try {
    const messagesRef = dbApi.ref(db, "messages");
    const recentMessages = dbApi.query(
      messagesRef,
      dbApi.limitToLast(100)
    );

    stopMessages = dbApi.onChildAdded(
      recentMessages,
      snapshot => showMessage(snapshot.val(), user, version),
      error => {
        if (version !== sessionVersion) return;
        console.error("Message read error:", error);
        statusText.textContent = "Database error";
        authError.textContent = explainError(error);
      }
    );

    sendBtn.disabled = false;
  } catch (error) {
    console.error("Chat startup error:", error);
    statusText.textContent = "Chat unavailable";
    authError.textContent = explainError(error);
  }
}

async function loadProfile(user) {
  const snapshot = await dbApi.get(
    dbApi.ref(db, "users/" + user.uid)
  );

  if (auth.currentUser?.uid !== user.uid) return;

  if (!snapshot.exists() || !snapshot.val()?.username) {
    throw new Error(
      "No saved username was found for this account. Register a new account or restore the missing Firebase profile."
    );
  }

  await openChat(user, snapshot.val().username);
}

async function registerAccount(email, password, username) {
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    throw new Error(
      "Username must be 3–20 characters using letters, numbers, or underscores."
    );
  }

  const usernameKey = username.toLowerCase();

  const credential = await authApi.createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  const user = credential.user;
  const usernameRef = dbApi.ref(
    db,
    "usernames/" + usernameKey
  );

  let usernameReserved = false;

  try {
    const result = await dbApi.runTransaction(
      usernameRef,
      existingUid => existingUid === null
        ? user.uid
        : undefined,
      { applyLocally: false }
    );

    if (!result.committed) {
      throw new Error(
        "That username is already taken. Choose another username."
      );
    }

    usernameReserved = true;

    await dbApi.set(
      dbApi.ref(db, "users/" + user.uid),
      {
        uid: user.uid,
        username: username,
        usernameLower: usernameKey,
        createdAt: dbApi.serverTimestamp()
      }
    );

    await openChat(user, username);
    authForm.reset();
  } catch (error) {
    console.error("Registration save error:", error);

    if (usernameReserved) {
      await dbApi.set(usernameRef, null).catch(console.error);
    }

    await user.delete().catch(console.error);
    throw error;
  }
}

authForm.addEventListener("submit", async event => {
  event.preventDefault();

  if (busy || !auth || !db) {
    authError.textContent = "Firebase is not ready yet. Please wait.";
    return;
  }

  busy = true;
  authSubmit.disabled = true;
  loginTab.disabled = true;
  registerTab.disabled = true;
  authError.textContent = "";

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode === "register") {
      registering = true;
      statusText.textContent = "Creating account...";

      await registerAccount(
        email,
        password,
        usernameInput.value.trim()
      );

      statusText.textContent = "ONLINE";
    } else {
      statusText.textContent = "Signing in...";

      const result = await authApi.signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      await loadProfile(result.user);
    }
  } catch (error) {
    console.error("Account error:", error);
    authError.textContent = explainError(error);
    statusText.textContent = "Action failed";
  } finally {
    registering = false;
    busy = false;
    authSubmit.disabled = false;
    loginTab.disabled = false;
    registerTab.disabled = false;
  }
});

chatForm.addEventListener("submit", async event => {
  event.preventDefault();

  const user = currentUser;
  const username = currentUsername;
  const message = messageInput.value.trim();

  if (!user || !message || sending) return;

  sending = true;
  sendBtn.disabled = true;

  try {
    await dbApi.push(dbApi.ref(db, "messages"), {
      uid: user.uid,
      name: username,
      text: message,
      createdAt: dbApi.serverTimestamp()
    });

    messageInput.value = "";
    statusText.textContent = "ONLINE";
  } catch (error) {
    console.error("Send error:", error);
    statusText.textContent = "Send failed";
    authError.textContent = explainError(error);
  } finally {
    sending = false;
    sendBtn.disabled = !currentUser;
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    if (stopMessages) stopMessages();
    stopMessages = null;

    stopChat();
    authPanel.hidden = false;
    authError.textContent = "";

    await authApi.signOut(auth);

    setMode("login");
    statusText.textContent = "Logged out";
  } catch (error) {
    console.error("Logout error:", error);
    statusText.textContent = "Logout failed";
    authError.textContent = explainError(error);
  }
});

async function startApp() {
  try {
    statusText.textContent = "Loading Firebase...";

    const appApi = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"
    );

    authApi = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js"
    );

    dbApi = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js"
    );

    const app = appApi.initializeApp(firebaseConfig);

    // CodePen preview workaround:
    // Avoid browser storage that may be blocked in embedded previews.
    auth = authApi.initializeAuth(app, {
      persistence: authApi.inMemoryPersistence
    });

    db = dbApi.getDatabase(app);

    statusText.textContent = "Firebase connected";

    authApi.onAuthStateChanged(auth, async user => {
      if (registering) return;

      stopChat();
      authError.textContent = "";

      if (!user) {
        authPanel.hidden = false;
        statusText.textContent = "Please log in";
        setMode("login");
        return;
      }

      authPanel.hidden = true;
      statusText.textContent = "Loading profile...";

      try {
        await loadProfile(user);
      } catch (error) {
        console.error("Profile loading error:", error);

        if (auth.currentUser?.uid !== user.uid) return;

        authPanel.hidden = false;
        profilePanel.hidden = true;
        chatForm.hidden = true;

        statusText.textContent = "Profile error";
        authError.textContent = explainError(error);
      }
    });
  } catch (error) {
    console.error("Firebase startup error:", error);
    statusText.textContent = "Connection failed";
    authPanel.hidden = false;
    authError.textContent = explainError(error);
  }
}

setMode("login");
startApp();
// ===== J.A.R.V.I.S. PIN LOCK =====


/* ===== J.A.R.V.I.S. SECURE ACCESS ===== */

const ACCESS_PIN = "GHHMC";

const lockScreen = document.getElementById("lockScreen");
const appContent = document.getElementById("appContent");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinError = document.getElementById("pinError");

let appStarted = false;

function lockWebsite() {
  appContent.hidden = true;
  lockScreen.hidden = false;
  pinInput.value = "";
  pinError.textContent = "";
}

pinForm.addEventListener("submit", async function (event) {
  event.preventDefault();

  if (pinInput.value.trim() !== ACCESS_PIN) {
    pinError.textContent = "Incorrect access PIN. Please try again.";
    pinInput.value = "";
    pinInput.focus();
    return;
  }

  pinError.textContent = "";
  lockScreen.hidden = true;
  appContent.hidden = false;

  if (!appStarted) {
    appStarted = true;
    await startApp();
  }
});

/* Initial screen */
setMode("login");
lockWebsite();
