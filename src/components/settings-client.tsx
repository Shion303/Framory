"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import type { PrivacyLevel, PublicUser } from "@/lib/types";
import { labels, privacyLevels } from "@/lib/constants";
import { apiJson } from "./client-utils";

export function SettingsClient() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    apiJson<{ user: PublicUser | null }>("/api/me")
      .then((payload) => setUser(payload.user))
      .catch((err: Error) => setMessage(err.message));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const payload = await apiJson<{ user: PublicUser }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: String(form.get("displayName")),
          avatarUrl: String(form.get("avatarUrl") ?? ""),
          bannerUrl: String(form.get("bannerUrl") ?? ""),
          bio: String(form.get("bio") ?? ""),
          profilePrivacy: String(form.get("profilePrivacy")),
          libraryPrivacy: String(form.get("libraryPrivacy")),
          progressPrivacy: String(form.get("progressPrivacy")),
          activityPrivacy: String(form.get("activityPrivacy"))
        })
      });
      setUser(payload.user);
      setMessage("Impostazioni salvate.");
      window.dispatchEvent(new Event("framory:badges-refresh"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Salvataggio non riuscito.");
    }
  }

  if (!user) {
    return <p className="card p-4 text-zinc-300">{message || "Caricamento impostazioni..."}</p>;
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="card p-6">
        <h1 className="text-3xl font-black">Impostazioni account</h1>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-bold">
            Nome visualizzato
            <input className="control mt-2" name="displayName" defaultValue={user.displayName} required />
          </label>
          <label className="block text-sm font-bold">
            Avatar URL
            <input className="control mt-2" name="avatarUrl" defaultValue={user.avatarUrl ?? ""} />
          </label>
          <label className="block text-sm font-bold">
            Banner URL
            <input className="control mt-2" name="bannerUrl" defaultValue={user.bannerUrl ?? ""} />
          </label>
          <label className="block text-sm font-bold">
            Bio
            <textarea className="control mt-2" name="bio" defaultValue={user.bio ?? ""} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <PrivacySelect label="Privacy profilo" name="profilePrivacy" value={user.profilePrivacy} />
            <PrivacySelect label="Privacy libreria" name="libraryPrivacy" value={user.libraryPrivacy} />
            <PrivacySelect label="Privacy progressi" name="progressPrivacy" value={user.progressPrivacy} />
            <PrivacySelect label="Privacy attività" name="activityPrivacy" value={user.activityPrivacy} />
          </div>
          {message ? <p className="rounded-md bg-zinc-950 p-3 text-sm text-zinc-200">{message}</p> : null}
          <button className="btn btn-primary" type="submit">
            <Save size={18} /> Salva
          </button>
        </form>
      </div>
    </section>
  );
}

function PrivacySelect({ label, name, value }: { label: string; name: string; value: PrivacyLevel }) {
  return (
    <label className="block text-sm font-bold">
      {label}
      <select className="control mt-2" name={name} defaultValue={value}>
        {privacyLevels.map((level) => (
          <option key={level} value={level}>
            {labels.privacy[level]}
          </option>
        ))}
      </select>
    </label>
  );
}
