"use client";

import { useState } from "react";

type AthleteProfile = {
  id: string;
  fullName: string;
  birthYear: number | null;
  relationship: string | null;
};

function profileLabel(profile: AthleteProfile) {
  return profile.birthYear
    ? `${profile.fullName} (${profile.birthYear})`
    : profile.fullName;
}

export function AthleteEntryFields({
  displayName,
  profiles,
  creationKey,
}: {
  displayName: string;
  profiles: AthleteProfile[];
  creationKey: string;
}) {
  const [entryKind, setEntryKind] = useState<"self" | "child">("self");
  const [childAthleteId, setChildAthleteId] = useState("new");
  const selfProfile = profiles.find((profile) => profile.relationship === "self");
  const childProfiles = profiles.filter((profile) => profile.relationship !== "self");
  const legacyProfiles = profiles.filter((profile) => profile.relationship === null);

  return (
    <fieldset className="fieldset">
      <legend>Kdo vstupuje do týmu?</legend>
      <input name="profileCreationKey" type="hidden" value={creationKey} />

      <label className="checkbox-label">
        <input
          checked={entryKind === "self"}
          name="entryKind"
          onChange={() => setEntryKind("self")}
          type="radio"
          value="self"
        />
        <strong>Vstupuji za sebe</strong>
        <small>
          Použijeme váš jediný osobní profil ve všech týmech. Nemusíte znovu
          vyplňovat sportovce.
        </small>
      </label>

      {entryKind === "self" ? (
        <div className="subcard">
          {selfProfile ? (
            <>
              <input name="selfAthleteId" type="hidden" value="" />
              <strong>{profileLabel(selfProfile)}</strong>
              <span>Tento osobní profil už máte a zůstane mu stejné ID.</span>
            </>
          ) : legacyProfiles.length ? (
            <label>
              Váš profil
              <select defaultValue="" name="selfAthleteId">
                <option value="">Vytvořit osobní profil „{displayName}“</option>
                {legacyProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    To jsem já: {profileLabel(profile)}
                  </option>
                ))}
              </select>
              <small>
                Starší profil přiřaďte jen tehdy, pokud skutečně patří vám.
                Profily se podle jména nikdy neslučují automaticky.
              </small>
            </label>
          ) : (
            <>
              <input name="selfAthleteId" type="hidden" value="" />
              <strong>{displayName}</strong>
              <span>Osobní profil vytvoříme z názvu vašeho účtu.</span>
            </>
          )}
        </div>
      ) : null}

      <label className="checkbox-label">
        <input
          checked={entryKind === "child"}
          name="entryKind"
          onChange={() => setEntryKind("child")}
          type="radio"
          value="child"
        />
        <strong>Přihlašuji dítě</strong>
        <small>Dítěti nevzniká uživatelský účet. Profil spravujete vy.</small>
      </label>

      {entryKind === "child" ? (
        <div className="form-stack subcard">
          <label>
            Dítě
            <select
              name="childAthleteId"
              onChange={(event) => setChildAthleteId(event.target.value)}
              value={childAthleteId}
            >
              <option value="new">Přidat další dítě</option>
              {childProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profileLabel(profile)}
                  {profile.relationship === null ? " – starší profil" : ""}
                </option>
              ))}
            </select>
            <small>Vybrat lze pouze profily spravované vaším účtem.</small>
          </label>

          {childAthleteId === "new" ? (
            <fieldset className="fieldset">
              <legend>Další dítě</legend>
              <label>
                Celé jméno
                <input autoComplete="name" maxLength={160} name="fullName" required />
              </label>
              <label>
                Rok narození (nepovinný)
                <input inputMode="numeric" maxLength={4} name="birthYear" />
              </label>
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
