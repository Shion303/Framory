import React, { useState } from "react";
import { X, Upload, Plus, Trash2, Save, ChevronLeft, ChevronRight, ImagePlus, Check } from "lucide-react";
import { entities, uploadFile } from "@/lib/api";
import { TYPE_META } from "@/components/TypeBadge";

const STEPS = [
  { key: "type", label: "Type" },
  { key: "general", label: "General" },
  { key: "images", label: "Images" },
  { key: "seasons", label: "Seasons" },
  { key: "episodes", label: "Episodes" },
  { key: "franchise", label: "Franchise" },
  { key: "save", label: "Save" },
];

function Field({ label, children, hint = undefined }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}

const inputCls =
  "w-full px-3.5 py-2.5 rounded-xl bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/60";

export function CreateContentWizard({
  open,
  onClose,
  onCreated,
  franchises = [],
}) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);

  const [form, setForm] = useState({
    content_type: "TV_SERIES",
    title: "",
    original_title: "",
    summary: "",
    year: "",
    release_date: "",
    status: "",
    genres: "",
    rating: "",
    language: "",
    country: "",
    poster_url: "",
    backdrop_url: "",
    seasons: [
      {
        number: 1,
        title: "",
        poster_url: "",
        episodes: [],
      },
    ],
    franchiseMode: "none",
    franchiseId: "",
    newFranchiseName: "",
  });

  if (!open) return null;

  const isEpisodic = form.content_type !== "FILM";

  const steps = STEPS.filter((s) =>
    (s.key === "seasons" || s.key === "episodes") && !isEpisodic
      ? false
      : true
  );

  function patch(p) {
    setForm((f) => ({ ...f, ...p }));
  }

  async function uploadImage(file, field) {
    if (!file) return;

    setUploadingField(field);

    try {
      const { file_url } = await uploadFile(file);
      patch({ [field]: file_url });
    } catch (e) {
      alert("Upload failed: " + (e.message || "error"));
    } finally {
      setUploadingField(null);
    }
  }

  async function uploadSeasonPoster(file, idx) {
    if (!file) return;

    setUploadingField(`season-${idx}`);

    try {
      const { file_url } = await uploadFile(file);

      setForm((f) => {
        const seasons = [...f.seasons];

        seasons[idx] = {
          ...seasons[idx],
          poster_url: file_url,
        };

        return {
          ...f,
          seasons,
        };
      });
    } catch (e) {
      alert("Upload failed");
    } finally {
      setUploadingField(null);
    }
  }

  async function uploadEpisodeImage(file, sIdx, eIdx) {
    if (!file) return;

    setUploadingField(`ep-${sIdx}-${eIdx}`);

    try {
      const { file_url } = await uploadFile(file);

      setForm((f) => {
        const seasons = [...f.seasons];
        const episodes = [...seasons[sIdx].episodes];

        episodes[eIdx] = {
          ...episodes[eIdx],
          image_url: file_url,
        };

        seasons[sIdx] = {
          ...seasons[sIdx],
          episodes,
        };

        return {
          ...f,
          seasons,
        };
      });
    } catch (e) {
      alert("Upload failed");
    } finally {
      setUploadingField(null);
    }
  }

  function addSeason() {
    setForm((f) => ({
      ...f,
      seasons: [
        ...f.seasons,
        {
          number: f.seasons.length + 1,
          title: "",
          poster_url: "",
          episodes: [],
        },
      ],
    }));
  }

  function removeSeason(idx) {
    setForm((f) => ({
      ...f,
      seasons: f.seasons.filter((_, i) => i !== idx),
    }));
  }

  function addEpisode(sIdx) {
    setForm((f) => {
      const seasons = [...f.seasons];
      const eps = seasons[sIdx].episodes;

      seasons[sIdx] = {
        ...seasons[sIdx],
        episodes: [
          ...eps,
          {
            number: eps.length + 1,
            title: "",
            description: "",
            airdate: "",
            runtime: "",
            image_url: "",
          },
        ],
      };

      return {
        ...f,
        seasons,
      };
    });
  }

  function removeEpisode(sIdx, eIdx) {
    setForm((f) => {
      const seasons = [...f.seasons];

      seasons[sIdx] = {
        ...seasons[sIdx],
        episodes: seasons[sIdx].episodes.filter(
          (_, i) => i !== eIdx
        ),
      };

      return {
        ...f,
        seasons,
      };
    });
  }

  async function save() {
    if (!form.title.trim()) {
      return alert("Title is required.");
    }

    setSaving(true);

    try {
      const genres = form.genres
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);

      const content = await entities.Content.create({
        title: form.title.trim(),
        original_title: form.original_title.trim(),
        summary: form.summary.trim(),

        poster_url: form.poster_url,
        backdrop_url: form.backdrop_url,

        genres,

        year: form.year
          ? parseInt(form.year, 10)
          : null,

        status: form.status.trim(),

        rating: form.rating
          ? parseFloat(form.rating)
          : 0,

        language: form.language.trim(),
        country: form.country.trim(),
        release_date: form.release_date,
        content_type: form.content_type,

        source: "MANUAL",
        provider: "MANUAL",
        provider_id: `manual-${Date.now()}`,

        total_seasons: isEpisodic
          ? form.seasons.length
          : 0,

        total_episodes: isEpisodic
          ? form.seasons.reduce(
              (s, se) => s + se.episodes.length,
              0
            )
          : 0,
      });

      // Seasons + episodes
      if (isEpisodic) {
        for (const se of form.seasons) {
          await entities.Season.create({
            content_id: content.id,
            season_number: se.number,
            title: se.title.trim(),
            episode_count: se.episodes.length,
            poster_url: se.poster_url,
            source: "MANUAL",
          });

          if (se.episodes.length > 0) {
            await entities.Episode.bulkCreate(
              se.episodes.map((e) => ({
                content_id: content.id,
                season_number: se.number,
                episode_number: e.number,
                title:
                  e.title.trim() ||
                  `Episode ${e.number}`,
                description: e.description.trim(),
                airdate: e.airdate,
                runtime: e.runtime
                  ? parseInt(e.runtime, 10)
                  : 0,
                image_url: e.image_url,
                source: "MANUAL",
              }))
            );
          }
        }
      }

      // Library item
      await entities.LibraryItem.create({
        content_id: content.id,
        title: content.title,
        poster_url: content.poster_url,
        status: "planning",
        added_date: new Date().toISOString(),
        content_type: form.content_type,
      });

      // Franchise
      let franchiseId = null;

      if (
        form.franchiseMode === "existing" &&
        form.franchiseId
      ) {
        franchiseId = form.franchiseId;
      } else if (
        form.franchiseMode === "new" &&
        form.newFranchiseName.trim()
      ) {
        const fr = await entities.Franchise.create({
          name: form.newFranchiseName.trim(),
          description: "",

          poster_url:
            content.backdrop_url ||
            content.poster_url,
        });

        franchiseId = fr.id;
      }

      if (franchiseId) {
        await entities.FranchiseContent.create({
          franchise_id: franchiseId,
          content_id: content.id,
        });
      }

      onCreated?.(content);

      // Reset
      setForm({
        content_type: "TV_SERIES",
        title: "",
        original_title: "",
        summary: "",
        year: "",
        release_date: "",
        status: "",
        genres: "",
        rating: "",
        language: "",
        country: "",
        poster_url: "",
        backdrop_url: "",
        seasons: [
          {
            number: 1,
            title: "",
            poster_url: "",
            episodes: [],
          },
        ],
        franchiseMode: "none",
        franchiseId: "",
        newFranchiseName: "",
      });

      setStep(0);
    } catch (e) {
      alert(
        "Save failed: " +
          (e.message || "error")
      );
    } finally {
      setSaving(false);
    }
  }

  const canNext = () => {
    if (steps[step]?.key === "type") return true;

    if (steps[step]?.key === "general") {
      return form.title.trim().length > 0;
    }

    return true;
  };

  return (
    <div
      className="fixed inset-0 z-[95] bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-2xl bg-card border border-border rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="text-lg font-semibold">
              Create Content
            </h3>

            <p className="text-xs text-muted-foreground">
              Add a title manually when it's not on TVmaze.
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="flex gap-1 px-5 py-3 overflow-x-auto no-scrollbar border-b border-border">
          {steps.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                i === step
                  ? "bg-primary text-primary-foreground"
                  : i < step
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {i < step && (
                <Check className="w-3 h-3 inline mr-1" />
              )}
              {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5 space-y-4">
          {steps[step]?.key === "type" && (
            <div className="grid grid-cols-3 gap-3">
              {["ANIME", "TV_SERIES", "FILM"].map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;

                return (
                  <button
                    key={t}
                    onClick={() =>
                      patch({ content_type: t })
                    }
                    className={`flex flex-col items-center gap-2 p-5 rounded-2xl border transition ${
                      form.content_type === t
                        ? "border-primary bg-primary/10 ring-1 ring-primary/60"
                        : "border-border bg-secondary hover:border-primary/40"
                    }`}
                  >
                    <Icon className="w-7 h-7 text-primary" />
                    <span className="text-sm font-medium">
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {steps[step]?.key === "general" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Field label="Title *">
                  <input
                    className={inputCls}
                    value={form.title}
                    onChange={(e) =>
                      patch({ title: e.target.value })
                    }
                    placeholder="e.g. Attack on Titan"
                  />
                </Field>
              </div>

              <Field label="Original title">
                <input
                  className={inputCls}
                  value={form.original_title}
                  onChange={(e) =>
                    patch({
                      original_title: e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Year">
                <input
                  className={inputCls}
                  type="number"
                  value={form.year}
                  onChange={(e) =>
                    patch({ year: e.target.value })
                  }
                  placeholder="2013"
                />
              </Field>

              <Field label="Release date">
                <input
                  className={inputCls}
                  type="date"
                  value={form.release_date}
                  onChange={(e) =>
                    patch({
                      release_date: e.target.value,
                    })
                  }
                />
              </Field>

              <Field label="Status">
                <input
                  className={inputCls}
                  value={form.status}
                  onChange={(e) =>
                    patch({ status: e.target.value })
                  }
                  placeholder="Ended / Running"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field
                  label="Genres"
                  hint="Comma-separated, e.g. Action, Fantasy"
                >
                  <input
                    className={inputCls}
                    value={form.genres}
                    onChange={(e) =>
                      patch({ genres: e.target.value })
                    }
                  />
                </Field>
              </div>

              <Field label="Rating (0-10)">
                <input
                  className={inputCls}
                  type="number"
                  step="0.1"
                  value={form.rating}
                  onChange={(e) =>
                    patch({ rating: e.target.value })
                  }
                />
              </Field>

              <Field label="Language">
                <input
                  className={inputCls}
                  value={form.language}
                  onChange={(e) =>
                    patch({ language: e.target.value })
                  }
                  placeholder="Japanese"
                />
              </Field>

              <Field label="Country">
                <input
                  className={inputCls}
                  value={form.country}
                  onChange={(e) =>
                    patch({ country: e.target.value })
                  }
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Description">
                  <textarea
                    className={`${inputCls} min-h-[90px] resize-y`}
                    value={form.summary}
                    onChange={(e) =>
                      patch({ summary: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
          )}

          {steps[step]?.key === "images" && (
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                {
                  field: "poster_url",
                  label: "Poster",
                  aspect: "aspect-[2/3]",
                },
                {
                  field: "backdrop_url",
                  label: "Backdrop",
                  aspect: "aspect-video",
                },
              ].map((img) => (
                <div key={img.field}>
                  <Field label={img.label}>
                    <div
                      className={`${img.aspect} rounded-xl overflow-hidden bg-secondary ring-1 ring-border flex items-center justify-center mb-2`}
                    >
                      {form[img.field] ? (
                        <img
                          src={form[img.field]}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImagePlus className="w-8 h-8 text-muted-foreground" />
                      )}
                    </div>
                  </Field>

                  <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary text-xs font-medium hover:bg-secondary/70 transition cursor-pointer w-fit">
                    {uploadingField === img.field ? (
                      <Upload className="w-4 h-4 animate-pulse" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}

                    {uploadingField === img.field
                      ? "Uploading…"
                      : "Upload from gallery"}

                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) =>
                        uploadImage(
                          e.target.files?.[0],
                          img.field
                        )
                      }
                    />
                  </label>
                </div>
              ))}
            </div>
          )}

          {steps[step]?.key === "seasons" && (
            <div className="space-y-3">
              {form.seasons.map((se, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-border bg-secondary/40 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">
                      Season {se.number}
                    </span>

                    <button
                      onClick={() =>
                        removeSeason(idx)
                      }
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-16 shrink-0">
                      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-secondary ring-1 ring-border flex items-center justify-center mb-1">
                        {se.poster_url ? (
                          <img
                            src={se.poster_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImagePlus className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>

                      <label className="flex items-center justify-center px-2 py-1 rounded-lg bg-secondary text-[10px] cursor-pointer">
                        {uploadingField ===
                        `season-${idx}`
                          ? "…"
                          : "Img"}

                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            uploadSeasonPoster(
                              e.target.files?.[0],
                              idx
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="flex-1 space-y-2">
                      <Field label="Season number">
                        <input
                          type="number"
                          className={inputCls}
                          value={se.number}
                          onChange={(e) =>
                            setForm((f) => {
                              const s = [
                                ...f.seasons,
                              ];

                              s[idx] = {
                                ...s[idx],
                                number:
                                  parseInt(
                                    e.target.value,
                                    10
                                  ) || 1,
                              };

                              return {
                                ...f,
                                seasons: s,
                              };
                            })
                          }
                        />
                      </Field>

                      <Field label="Season title">
                        <input
                          className={inputCls}
                          value={se.title}
                          onChange={(e) =>
                            setForm((f) => {
                              const s = [
                                ...f.seasons,
                              ];

                              s[idx] = {
                                ...s[idx],
                                title: e.target.value,
                              };

                              return {
                                ...f,
                                seasons: s,
                              };
                            })
                          }
                          placeholder="e.g. Season 1"
                        />
                      </Field>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={addSeason}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition"
              >
                <Plus className="w-4 h-4" />
                Add season
              </button>
            </div>
          )}

          {steps[step]?.key === "episodes" && (
            <div className="space-y-4">
              {form.seasons.map((se, sIdx) => (
                <div
                  key={sIdx}
                  className="rounded-2xl border border-border bg-secondary/40 p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold">
                      Season {se.number} ·{" "}
                      {se.episodes.length} episodes
                    </span>

                    <button
                      onClick={() =>
                        addEpisode(sIdx)
                      }
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add episode
                    </button>
                  </div>

                  <div className="space-y-2">
                    {se.episodes.map((e, eIdx) => (
                      <div
                        key={eIdx}
                        className="rounded-xl border border-border bg-card p-3"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground font-mono">
                            E{e.number}
                          </span>

                          <button
                            onClick={() =>
                              removeEpisode(
                                sIdx,
                                eIdx
                              )
                            }
                            className="p-1 rounded text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2">
                          <Field label="Episode number">
                            <input
                              type="number"
                              className={inputCls}
                              value={e.number}
                              onChange={(ev) =>
                                setForm((f) => {
                                  const s = [
                                    ...f.seasons,
                                  ];
                                  const eps = [
                                    ...s[sIdx]
                                      .episodes,
                                  ];

                                  eps[eIdx] = {
                                    ...eps[eIdx],
                                    number:
                                      parseInt(
                                        ev.target.value,
                                        10
                                      ) || 1,
                                  };

                                  s[sIdx] = {
                                    ...s[sIdx],
                                    episodes: eps,
                                  };

                                  return {
                                    ...f,
                                    seasons: s,
                                  };
                                })
                              }
                            />
                          </Field>

                          <Field label="Title">
                            <input
                              className={inputCls}
                              value={e.title}
                              onChange={(ev) =>
                                setForm((f) => {
                                  const s = [
                                    ...f.seasons,
                                  ];
                                  const eps = [
                                    ...s[sIdx]
                                      .episodes,
                                  ];

                                  eps[eIdx] = {
                                    ...eps[eIdx],
                                    title:
                                      ev.target.value,
                                  };

                                  s[sIdx] = {
                                    ...s[sIdx],
                                    episodes: eps,
                                  };

                                  return {
                                    ...f,
                                    seasons: s,
                                  };
                                })
                              }
                            />
                          </Field>

                          <Field label="Airdate">
                            <input
                              type="date"
                              className={inputCls}
                              value={e.airdate}
                              onChange={(ev) =>
                                setForm((f) => {
                                  const s = [
                                    ...f.seasons,
                                  ];
                                  const eps = [
                                    ...s[sIdx]
                                      .episodes,
                                  ];

                                  eps[eIdx] = {
                                    ...eps[eIdx],
                                    airdate:
                                      ev.target.value,
                                  };

                                  s[sIdx] = {
                                    ...s[sIdx],
                                    episodes: eps,
                                  };

                                  return {
                                    ...f,
                                    seasons: s,
                                  };
                                })
                              }
                            />
                          </Field>

                          <Field label="Runtime (min)">
                            <input
                              type="number"
                              className={inputCls}
                              value={e.runtime}
                              onChange={(ev) =>
                                setForm((f) => {
                                  const s = [
                                    ...f.seasons,
                                  ];
                                  const eps = [
                                    ...s[sIdx]
                                      .episodes,
                                  ];

                                  eps[eIdx] = {
                                    ...eps[eIdx],
                                    runtime:
                                      ev.target.value,
                                  };

                                  s[sIdx] = {
                                    ...s[sIdx],
                                    episodes: eps,
                                  };

                                  return {
                                    ...f,
                                    seasons: s,
                                  };
                                })
                              }
                            />
                          </Field>

                          <div className="sm:col-span-2">
                            <Field label="Description">
                              <input
                                className={inputCls}
                                value={e.description}
                                onChange={(ev) =>
                                  setForm((f) => {
                                    const s = [
                                      ...f.seasons,
                                    ];
                                    const eps = [
                                      ...s[sIdx]
                                        .episodes,
                                    ];

                                    eps[eIdx] = {
                                      ...eps[eIdx],
                                      description:
                                        ev.target.value,
                                    };

                                    s[sIdx] = {
                                      ...s[sIdx],
                                      episodes: eps,
                                    };

                                    return {
                                      ...f,
                                      seasons: s,
                                    };
                                  })
                                }
                              />
                            </Field>
                          </div>

                          <div className="sm:col-span-2 flex items-center gap-3">
                            <div className="w-16 h-10 rounded-lg overflow-hidden bg-secondary ring-1 ring-border flex items-center justify-center">
                              {e.image_url ? (
                                <img
                                  src={e.image_url}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImagePlus className="w-4 h-4 text-muted-foreground" />
                              )}
                            </div>

                            <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-secondary text-xs cursor-pointer">
                              {uploadingField ===
                              `ep-${sIdx}-${eIdx}`
                                ? "…"
                                : "Episode image"}

                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(ev) =>
                                  uploadEpisodeImage(
                                    ev.target.files?.[0],
                                    sIdx,
                                    eIdx
                                  )
                                }
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}

                    {se.episodes.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">
                        No episodes yet for this season.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {steps[step]?.key === "franchise" && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    k: "none",
                    l: "No franchise",
                  },
                  {
                    k: "existing",
                    l: "Existing",
                  },
                  {
                    k: "new",
                    l: "Create new",
                  },
                ].map((o) => (
                  <button
                    key={o.k}
                    onClick={() =>
                      patch({
                        franchiseMode: o.k,
                      })
                    }
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                      form.franchiseMode === o.k
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>

              {form.franchiseMode === "existing" && (
                <Field label="Select franchise">
                  <select
                    className={inputCls}
                    value={form.franchiseId}
                    onChange={(e) =>
                      patch({
                        franchiseId:
                          e.target.value,
                      })
                    }
                  >
                    <option value="">
                      — Select —
                    </option>

                    {franchises.map((f) => (
                      <option
                        key={f.id}
                        value={f.id}
                      >
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}

              {form.franchiseMode === "new" && (
                <Field label="New franchise name">
                  <input
                    className={inputCls}
                    value={form.newFranchiseName}
                    onChange={(e) =>
                      patch({
                        newFranchiseName:
                          e.target.value,
                      })
                    }
                    placeholder="e.g. Monsterverse"
                  />
                </Field>
              )}
            </div>
          )}

          {steps[step]?.key === "save" && (
            <div className="text-center py-6">
              <Check className="w-12 h-12 text-primary mx-auto mb-3" />

              <p className="text-sm text-muted-foreground mb-1">
                Ready to create:
              </p>

              <p className="text-lg font-semibold mb-4">
                {form.title || "Untitled"} ·{" "}
                {TYPE_META[form.content_type].label}
              </p>

              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />

                {saving
                  ? "Saving…"
                  : "Create & add to library"}
              </button>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between p-4 border-t border-border">
          <button
            onClick={() =>
              setStep((s) => Math.max(0, s - 1))
            }
            disabled={step === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-secondary text-sm disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>

          {step < steps.length - 1 ? (
            <button
              onClick={() =>
                canNext() &&
                setStep((s) => s + 1)
              }
              disabled={!canNext()}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default CreateContentWizard;