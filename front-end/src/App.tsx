import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";
import { Html5QrcodeScanner } from "html5-qrcode";
import "./App.css";
import { api, clearSession, saveSession, type Event, type Registration, type User } from "./api";

type AuthResponse = { token: string; user: User };

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem("attendly_user");
    return stored ? JSON.parse(stored) as User : null;
  });
  const [page, setPage] = useState("events");
  const [error, setError] = useState("");

  if (!user) {
    return <AuthPage onAuthenticated={(session) => { saveSession(session.token, session.user); setUser(session.user); }} />;
  }

  const logout = () => { clearSession(); setUser(null); };
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("events")}>attendly<span>.</span></button>
        <nav>
          <button className={page === "events" ? "active" : ""} onClick={() => setPage("events")}>Discover events</button>
          <button className={page === "registrations" ? "active" : ""} onClick={() => setPage("registrations")}>My QR passes</button>
          {user.role === "ORGANIZER" && <button className={page === "manage" ? "active" : ""} onClick={() => setPage("manage")}>Organizer studio</button>}
        </nav>
        <div className="account"><span>{user.name}</span><button className="ghost" onClick={logout}>Log out</button></div>
      </header>
      {error && <div className="alert error">{error}</div>}
      <main>
        {page === "events" && <EventsPage user={user} onError={setError} />}
        {page === "registrations" && <RegistrationsPage onError={setError} />}
        {page === "manage" && user.role === "ORGANIZER" && <OrganizerPage onError={setError} />}
      </main>
    </div>
  );
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (session: AuthResponse) => void }) {
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "STUDENT" });
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      const path = registering ? "/auth/register" : "/auth/login";
      const body = registering ? form : { email: form.email, password: form.password };
      onAuthenticated(await api<AuthResponse>(path, { method: "POST", body: JSON.stringify(body) }));
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to authenticate"); }
  };
  return <div className="auth-page"><div className="auth-card">
    <div className="eyebrow">ATTENDLY</div><h1>Welcome <em>back.</em></h1>
    <p className="muted">Sign in to discover events and manage your attendance.</p>
    {error && <div className="alert error">{error}</div>}
    <form onSubmit={submit}>
      {registering && <input required placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
      <input required type="email" placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input required type="password" minLength={registering ? 8 : 1} placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      {registering && <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="STUDENT">Student</option><option value="ORGANIZER">Organizer</option></select>}
      <button className="primary" type="submit">{registering ? "Create account" : "Log in"} <span>→</span></button>
    </form>
    <button className="link-button" onClick={() => { setRegistering(!registering); setError(""); }}>{registering ? "Already have an account? Log in" : "New here? Create an account"}</button>
  </div></div>;
}

function EventsPage({ onError }: { user: User; onError: (message: string) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  useEffect(() => { api<{ events: Event[] }>("/events").then((data) => setEvents(data.events)).catch((err) => onError(err.message)).finally(() => setLoading(false)); }, [onError]);
  const register = async (eventId: string) => {
    try { await api(`/events/${eventId}/register`, { method: "POST" }); setEvents(events.filter((event) => event.id !== eventId)); }
    catch (err) { onError(err instanceof Error ? err.message : "Unable to register"); }
  };
  const scanEvent = async (decodedText: string) => {
    const token = decodedText.startsWith("ATTENDLY_EVENT:") ? decodedText.slice("ATTENDLY_EVENT:".length) : decodedText;
    try {
      const result = await api<{ event: Event }>(`/events/qr/${encodeURIComponent(token)}`);
      await register(result.event.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Unable to read this event QR code");
    } finally {
      setScanning(false);
    }
  };
  return <section><div className="page-heading"><div><div className="eyebrow">EVENTS</div><h2>What’s happening <em>near you?</em></h2></div><div className="heading-actions"><div className="count-pill">{events.length} upcoming</div><button className="secondary" onClick={() => setScanning(!scanning)}>{scanning ? "Close scanner" : "Scan event QR"}</button></div></div>
    {scanning && <EventScanner onScan={scanEvent} onError={onError} />}
    {loading ? <p className="muted">Loading events...</p> : events.length === 0 ? <EmptyState text="No upcoming events yet. Check back soon." /> :
      <div className="event-grid">{events.map((event) => <article className="event-card" key={event.id}><div className="event-date">{formatDate(event.startsAt)}</div><h3>{event.title}</h3><p>{event.description || "Join us for a great campus event."}</p><div className="event-meta"><span>{formatTime(event.startsAt)} – {formatTime(event.endsAt)}</span><span>{event.venue}</span></div><button className="primary full" onClick={() => register(event.id)}>Register now <span>→</span></button></article>)}</div>}
  </section>;
}

function RegistrationsPage({ onError }: { onError: (message: string) => void }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [qr, setQr] = useState<Record<string, string>>({});
  useEffect(() => { api<{ registrations: Registration[] }>("/me/registrations").then(async (data) => { setRegistrations(data.registrations); const images: Record<string, string> = {}; for (const item of data.registrations) images[item.id] = await QRCode.toDataURL(item.qrToken, { width: 220, margin: 2 }); setQr(images); }).catch((err) => onError(err.message)); }, [onError]);
  const cancel = async (id: string) => { try { await api(`/registrations/${id}`, { method: "DELETE" }); setRegistrations(registrations.filter((item) => item.id !== id)); } catch (err) { onError(err instanceof Error ? err.message : "Unable to cancel"); } };
  return <section><div className="page-heading"><div><div className="eyebrow">YOUR PASSES</div><h2>Ready when <em>you are.</em></h2></div></div>{registrations.length === 0 ? <EmptyState text="You are not registered for any events yet." /> : <div className="pass-grid">{registrations.map((item) => <article className="pass-card" key={item.id}><div><div className="eyebrow">QR CHECK-IN PASS</div><h3>{item.event.title}</h3><p className="muted">{new Date(item.event.startsAt).toLocaleString()} · {item.event.venue}</p><button className="link-button danger" onClick={() => cancel(item.id)}>Cancel registration</button></div>{qr[item.id] && <img src={qr[item.id]} alt={`QR code for ${item.event.title}`} />}</article>)}</div>}</section>;
}

function OrganizerPage({ onError }: { onError: (message: string) => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState({ title: "", description: "", venue: "", startsAt: "", endsAt: "", capacity: "100" });
  const [selected, setSelected] = useState<Event | null>(null);
  const load = () => api<{ events: Event[] }>("/organizer/events").then((data) => setEvents(data.events)).catch((err) => onError(err.message));
  useEffect(() => { load(); }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api("/organizer/events", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          startsAt: toIsoDateTime(form.startsAt),
          endsAt: toIsoDateTime(form.endsAt),
          capacity: Number(form.capacity),
        }),
      });
      setForm({ title: "", description: "", venue: "", startsAt: "", endsAt: "", capacity: "100" });
      load();
    } catch (err) { onError(err instanceof Error ? err.message : "Unable to create event"); }
  };
  return <section><div className="page-heading"><div><div className="eyebrow">ORGANIZER</div><h2>Manage your <em>events.</em></h2></div></div><div className="studio-grid"><form className="panel" onSubmit={create}><h3>Create an event</h3><input required placeholder="Event title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><textarea placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /><input required placeholder="Venue" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} /><div className="two-col"><label>Starts<input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label><label>Ends<input required type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label></div><label>Capacity<input required type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label><button className="primary" type="submit">Create event <span>→</span></button></form><div className="panel"><h3>Your events</h3>{events.length === 0 ? <EmptyState text="Your published events will appear here." /> : events.map((event) => <button className="event-row" key={event.id} onClick={() => setSelected(event)}><span><strong>{event.title}</strong><small>{formatDateTime(event.startsAt)} – {formatTime(event.endsAt)}</small></span><span>{event._count?.registrations ?? 0}/{event.capacity} registered →</span></button>)}{selected && <><EventQr event={selected} /><Attendance event={selected} onError={onError} /></>}</div></div></section>;
}

function Attendance({ event, onError }: { event: Event; onError: (message: string) => void }) {
  const [token, setToken] = useState(""); const [message, setMessage] = useState(""); const [scanning, setScanning] = useState(false);
  useEffect(() => {
    if (!scanning) return;
    const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 220, height: 220 } }, false);
    scanner.render((decodedText) => { setToken(decodedText); setScanning(false); void scanner.clear(); }, () => {});
    return () => { void scanner.clear().catch((error: unknown) => console.error("Unable to stop QR scanner", error)); };
  }, [scanning]);
  const checkIn = async (e: FormEvent) => { e.preventDefault(); try { const result = await api<{ message: string; attendee: { name: string } }>("/check-in", { method: "POST", body: JSON.stringify({ token, eventId: event.id }) }); setMessage(`${result.attendee.name} checked in.`); setToken(""); } catch (err) { onError(err instanceof Error ? err.message : "Check-in failed"); } };
  return <div className="attendance"><h4>Quick check-in</h4>{scanning && <div id="qr-reader" className="scanner" />}<form onSubmit={checkIn}><input required minLength={32} placeholder="Paste scanned QR token" value={token} onChange={(e) => setToken(e.target.value)} /><button className="secondary" type="button" onClick={() => setScanning(!scanning)}>{scanning ? "Stop camera" : "Scan with camera"}</button><button className="primary" type="submit">Check in</button></form>{message && <div className="alert success">{message}</div>}<p className="muted small">Allow camera access to scan a student QR pass, or paste its token for testing.</p></div>;
}

function EventQr({ event }: { event: Event }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    if (event.qrToken) void QRCode.toDataURL(`ATTENDLY_EVENT:${event.qrToken}`, { width: 240, margin: 2 }).then(setImage);
  }, [event.qrToken]);
  return <div className="event-qr"><div><div className="eyebrow">EVENT QR CODE</div><h4>Students scan to register</h4><p className="muted small">Display this code at the venue or add it to your event post.</p></div>{image && <img src={image} alt={`Registration QR code for ${event.title}`} />}</div>;
}

function EventScanner({ onScan, onError }: { onScan: (value: string) => void; onError: (message: string) => void }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner("event-qr-reader", { fps: 10, qrbox: { width: 220, height: 220 } }, false);
    scanner.render((decodedText) => { void scanner.clear(); onScan(decodedText); }, () => {});
    return () => { void scanner.clear().catch((error: unknown) => { onError(error instanceof Error ? error.message : "Unable to stop QR scanner"); }); };
  }, [onScan, onError]);
  return <div className="event-scanner"><div id="event-qr-reader" /></div>;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value: string) {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString();
}

function EmptyState({ text }: { text: string }) { return <div className="empty"><span>✦</span><p>{text}</p></div>; }

export default App;
