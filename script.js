
const statusText = document.getElementById("status");
const messages = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "jarvis-connect-816ce.firebaseapp.com",
  databaseURL: "https://jarvis-connect-816ce-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jarvis-connect-816ce",
  storageBucket: "jarvis-connect-816ce.firebasestorage.app",
  messagingSenderId: "336780686395",
  appId: "1:336780686395:web:65674db992e749a4e1181e"
};

let sending = false;

function showMessage(data, currentUser) {
  if (!data) return;

  messages.querySelector(".welcome")?.remove();

  const bubble = document.createElement("div");
  bubble.className = "message";

  if (data.uid === currentUser.uid) {
    bubble.classList.add("sent");
  }

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = data.name || "Agent";

  const text = document.createElement("div");
  text.className = "text";
  text.textContent = data.text || "";

  const time = document.createElement("span");
  time.className = "time";

  time.textContent = data.createdAt
    ? new Date(data.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })
    : "Just now";

  bubble.append(name, text, time);
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
}

async function startChat() {
  try {
    statusText.textContent = "Loading Firebase...";

    const { initializeApp } = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js"
    );

    const { getAuth, signInAnonymously } = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js"
    );

    const {
      getDatabase,
      ref,
      push,
      onChildAdded,
      query,
      limitToLast,
      serverTimestamp
    } = await import(
      "https://www.gstatic.com/firebasejs/13.0.0/firebase-database.js"
    );

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getDatabase(app);

    statusText.textContent = "Signing in...";

    const result = await signInAnonymously(auth);
    const currentUser = result.user;

    const displayName =
      (prompt("Enter your agent name:") || "Agent")
        .trim().slice(0, 30) || "Agent";

    const messagesRef = ref(db, "messages");

    onChildAdded(
      query(messagesRef, limitToLast(100)),
      snapshot => showMessage(snapshot.val(), currentUser),
      error => {
        console.error("Read error:", error);
        statusText.textContent = "Database error";
      }
    );

    statusText.textContent = "ONLINE";
    sendBtn.disabled = false;

    chatForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = messageInput.value.trim();

      if (!message || sending) return;

      sending = true;
      sendBtn.disabled = true;

      try {
        await push(messagesRef, {
          uid: currentUser.uid,
          name: displayName,
          text: message,
          createdAt: serverTimestamp()
        });

        messageInput.value = "";
        statusText.textContent = "ONLINE";
      } catch (error) {
        console.error("Send error:", error);
        statusText.textContent = "Send failed";
        alert("Message could not be sent: " + error.message);
      } finally {
        sending = false;
        sendBtn.disabled = false;
      }
    });

  } catch (error) {
    console.error("Firebase startup error:", error);
    statusText.textContent = "Connection failed";
    alert("Firebase error: " + error.message);
  }
}

startChat();
