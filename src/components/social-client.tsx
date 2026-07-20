"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Check, MessageCircle, Search, Send, UserPlus, X } from "lucide-react";
import type { FriendRequest, Friendship, PrivateMessage, PublicUser, SocialUser } from "@/lib/types";
import { apiJson } from "./client-utils";

type SocialSummary = {
  friends: Friendship[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

export function SocialClient() {
  const [me, setMe] = useState<PublicUser | null>(null);
  const [summary, setSummary] = useState<SocialSummary>({ friends: [], incoming: [], outgoing: [] });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialUser[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friendship | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refreshSocial();
  }, []);

  async function refreshSocial() {
    setLoading(true);
    try {
      const [mePayload, socialPayload] = await Promise.all([
        apiJson<{ user: PublicUser | null }>("/api/me"),
        apiJson<SocialSummary>("/api/social/friends")
      ]);
      setMe(mePayload.user);
      setSummary(socialPayload);
      setSelectedFriend((current) => {
        if (!current) {
          return socialPayload.friends[0] ?? null;
        }
        return socialPayload.friends.find((friend) => friend.friendId === current.friendId) ?? socialPayload.friends[0] ?? null;
      });
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Social non disponibile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedFriend) {
      setMessages([]);
      return;
    }
    apiJson<{ messages: PrivateMessage[] }>(`/api/social/messages/${selectedFriend.friendId}`)
      .then((payload) => setMessages(payload.messages))
      .catch((error: Error) => setNotice(error.message));
  }, [selectedFriend]);

  async function searchUsers(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      setResults([]);
      return;
    }
    try {
      const payload = await apiJson<{ users: SocialUser[] }>(`/api/social/search?q=${encodeURIComponent(cleanQuery)}`);
      setResults(payload.users);
      setNotice(payload.users.length ? "" : "Nessun utente trovato.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ricerca non riuscita.");
    }
  }

  async function sendRequest(targetId: string) {
    try {
      await apiJson("/api/social/friends", {
        method: "POST",
        body: JSON.stringify({ targetId })
      });
      setResults((current) => current.map((user) => (user.id === targetId ? { ...user, friendship: "pending_sent" } : user)));
      await refreshSocial();
      setNotice("Richiesta inviata.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Richiesta non inviata.");
    }
  }

  async function respondRequest(requestId: string, action: "accept" | "decline") {
    try {
      await apiJson(`/api/social/friends/requests/${requestId}`, {
        method: "PATCH",
        body: JSON.stringify({ action })
      });
      await refreshSocial();
      setNotice(action === "accept" ? "Amicizia accettata." : "Richiesta rifiutata.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operazione non riuscita.");
    }
  }

  async function removeFriend(friendId: string) {
    try {
      await apiJson(`/api/social/friends/${friendId}`, { method: "DELETE" });
      if (selectedFriend?.friendId === friendId) {
        setSelectedFriend(null);
      }
      await refreshSocial();
      setNotice("Amico rimosso.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operazione non riuscita.");
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFriend || !messageBody.trim()) {
      return;
    }
    try {
      const payload = await apiJson<{ message: PrivateMessage }>(`/api/social/messages/${selectedFriend.friendId}`, {
        method: "POST",
        body: JSON.stringify({ body: messageBody })
      });
      setMessages((current) => [...current, payload.message]);
      setMessageBody("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Messaggio non inviato.");
    }
  }

  if (loading) {
    return <p className="card p-4 text-zinc-300">Caricamento social...</p>;
  }

  if (!me) {
    return (
      <section className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-4xl font-black text-zinc-50">Social</h1>
        <p className="card p-5 text-zinc-300">{notice || "Accedi per usare il social."}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase text-violet-300">Framory Social</p>
          <h1 className="text-4xl font-black text-zinc-50">Amici e messaggi</h1>
        </div>
        <span className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
          {summary.friends.length} amici
        </span>
      </section>

      {notice ? <p className="rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{notice}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <aside className="space-y-5">
          <section className="card p-4">
            <h2 className="text-xl font-black text-zinc-50">Cerca utenti</h2>
            <form className="mt-3 flex gap-2" onSubmit={searchUsers}>
              <input className="control min-w-0 flex-1" onChange={(event) => setQuery(event.target.value)} placeholder="Username o nome" value={query} />
              <button className="btn btn-primary" title="Cerca" type="submit">
                <Search size={18} />
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {results.map((user) => (
                <UserRow action={<UserAction onSendRequest={() => sendRequest(user.id)} state={user.friendship} />} key={user.id} user={user} />
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-xl font-black text-zinc-50">Richieste</h2>
            <div className="mt-3 space-y-2">
              {summary.incoming.length ? (
                summary.incoming.map((request) => (
                  <UserRow
                    action={
                      <div className="flex gap-2">
                        <button className="btn btn-primary px-3" onClick={() => respondRequest(request.id, "accept")} title="Accetta" type="button">
                          <Check size={16} />
                        </button>
                        <button className="btn btn-ghost px-3" onClick={() => respondRequest(request.id, "decline")} title="Rifiuta" type="button">
                          <X size={16} />
                        </button>
                      </div>
                    }
                    key={request.id}
                    user={request.requester}
                  />
                ))
              ) : (
                <p className="text-sm text-zinc-400">Nessuna richiesta in arrivo.</p>
              )}
              {summary.outgoing.map((request) => (
                <UserRow action={<span className="text-xs text-zinc-400">In attesa</span>} key={request.id} user={request.addressee} />
              ))}
            </div>
          </section>

          <section className="card p-4">
            <h2 className="text-xl font-black text-zinc-50">Amici</h2>
            <div className="mt-3 space-y-2">
              {summary.friends.length ? (
                summary.friends.map((friendship) => (
                  <button
                    className={`w-full rounded-md border p-3 text-left ${
                      selectedFriend?.friendId === friendship.friendId ? "border-violet-500 bg-violet-950/40" : "border-zinc-800 bg-zinc-950"
                    }`}
                    key={friendship.id}
                    onClick={() => setSelectedFriend(friendship)}
                    type="button"
                  >
                    <span className="block text-zinc-50">{friendship.friend.displayName}</span>
                    <span className="text-sm text-zinc-400">@{friendship.friend.username}</span>
                  </button>
                ))
              ) : (
                <p className="text-sm text-zinc-400">Nessun amico aggiunto.</p>
              )}
            </div>
          </section>
        </aside>

        <section className="card flex min-h-[38rem] flex-col p-4">
          {selectedFriend ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-2xl font-black text-zinc-50">{selectedFriend.friend.displayName}</h2>
                  <p className="text-sm text-zinc-400">@{selectedFriend.friend.username}</p>
                </div>
                <button className="btn btn-ghost" onClick={() => removeFriend(selectedFriend.friendId)} type="button">
                  <X size={18} /> Rimuovi
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto py-4">
                {messages.length ? (
                  messages.map((message) => <MessageBubble key={message.id} meId={me.id} message={message} />)
                ) : (
                  <p className="flex h-full items-center justify-center text-zinc-400">
                    <MessageCircle size={18} className="mr-2" /> Nessun messaggio.
                  </p>
                )}
              </div>
              <form className="flex gap-2 border-t border-zinc-800 pt-3" onSubmit={sendMessage}>
                <input
                  className="control min-w-0 flex-1"
                  maxLength={1000}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder="Scrivi un messaggio"
                  value={messageBody}
                />
                <button className="btn btn-primary" title="Invia" type="submit">
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <p className="flex flex-1 items-center justify-center text-zinc-400">Seleziona un amico.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function UserRow({ user, action }: { user: Pick<PublicUser, "displayName" | "username" | "avatarUrl">; action: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-black">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="" className="h-full w-full object-cover" src={user.avatarUrl} />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate text-zinc-50">{user.displayName}</p>
          <p className="truncate text-sm text-zinc-400">@{user.username}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function UserAction({ state, onSendRequest }: { state: SocialUser["friendship"]; onSendRequest: () => void }) {
  if (state === "friends") {
    return <span className="text-xs text-violet-300">Amici</span>;
  }
  if (state === "pending_sent") {
    return <span className="text-xs text-zinc-400">In attesa</span>;
  }
  if (state === "pending_received") {
    return <span className="text-xs text-violet-300">Ti ha scritto</span>;
  }
  return (
    <button className="btn btn-primary px-3" onClick={onSendRequest} title="Aggiungi" type="button">
      <UserPlus size={16} />
    </button>
  );
}

function MessageBubble({ message, meId }: { message: PrivateMessage; meId: string }) {
  const mine = message.senderId === meId;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[78%] rounded-md px-3 py-2 ${mine ? "bg-violet-700 text-white" : "bg-zinc-950 text-zinc-100"}`}>
        <p className="text-xs text-zinc-300">{mine ? "Tu" : message.sender.displayName}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.body}</p>
      </div>
    </div>
  );
}
