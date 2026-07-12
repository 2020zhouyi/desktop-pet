import { useEffect, useMemo, useRef, useState } from "react";
import { desktopPetApi } from "../desktopPetApi";
import type { PetOption } from "../types";
import { pickerPreviewIds, previewRequestSlots } from "./pickerPreview";

const pageSize = 8;

type PageDirection = "next" | "previous";

type PetPickerProps = {
  pets: PetOption[];
  selected: PetOption | null;
  switchingPetId: string | null;
  onClose: () => void;
  onManageLibrary: () => void;
  launchAtLogin: boolean;
  isUpdatingLaunchAtLogin: boolean;
  onLaunchAtLoginChange: (enabled: boolean) => void;
  onSelect: (id: string) => void;
};

export function PetPicker({
  pets,
  selected,
  switchingPetId,
  onClose,
  onManageLibrary,
  launchAtLogin,
  isUpdatingLaunchAtLogin,
  onLaunchAtLoginChange,
  onSelect,
}: PetPickerProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(false);
  const inFlightPreviewIdsRef = useRef(new Set<string>());
  const [pageIndex, setPageIndex] = useState(0);
  const [pageDirection, setPageDirection] = useState<PageDirection>("next");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftPetId, setDraftPetId] = useState<string | null>(selected?.id ?? null);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [previewQueueVersion, setPreviewQueueVersion] = useState(0);
  const livePetIds = useMemo(() => new Set(pets.map((pet) => pet.id)), [pets]);
  const livePetIdsRef = useRef(livePetIds);
  livePetIdsRef.current = livePetIds;
  const filteredPets = useMemo(
    () => pets.filter((pet) => petMatchesSearch(pet, searchQuery)),
    [pets, searchQuery],
  );
  const draftPet = useMemo(
    () => pets.find((pet) => pet.id === draftPetId) ?? selected ?? null,
    [draftPetId, pets, selected],
  );
  const pageCount = Math.max(1, Math.ceil(filteredPets.length / pageSize));
  const visibleStart =
    pageIndex === pageCount - 1 && filteredPets.length > pageSize
      ? Math.max(0, filteredPets.length - pageSize)
      : pageIndex * pageSize;
  const visiblePets = useMemo(
    () => filteredPets.slice(visibleStart, visibleStart + pageSize),
    [filteredPets, visibleStart],
  );
  const previewIds = useMemo(
    () => pickerPreviewIds(visiblePets.map((pet) => pet.id), draftPet?.id),
    [draftPet?.id, visiblePets],
  );
  const canGoBack = pageIndex > 0;
  const canGoForward = pageIndex < pageCount - 1;
  const detailPreviewUrl = draftPet ? previews[draftPet.id] ?? draftPet.spritesheetUrl : null;
  const hasDraftChange = Boolean(draftPet && draftPet.id !== selected?.id);
  const isSwitchingDraft = Boolean(draftPet && switchingPetId === draftPet.id);

  useEffect(() => {
    searchInputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setPreviews((current) => {
      const entries = Object.entries(current).filter(([petId]) => livePetIds.has(petId));
      return entries.length === Object.keys(current).length
        ? current
        : Object.fromEntries(entries);
    });
  }, [livePetIds]);

  useEffect(() => {
    const requestIds = previewRequestSlots(
      previewIds,
      inFlightPreviewIdsRef.current,
      new Set(Object.keys(previews)),
    );
    for (const petId of requestIds) {
      inFlightPreviewIdsRef.current.add(petId);
      void desktopPetApi.getPetPreview(petId)
        .catch(() => null)
        .then((previewUrl) => {
          if (!mountedRef.current || !livePetIdsRef.current.has(petId)) return;
          setPreviews((current) =>
            Object.prototype.hasOwnProperty.call(current, petId)
              ? current
              : { ...current, [petId]: previewUrl },
          );
        })
        .finally(() => {
          inFlightPreviewIdsRef.current.delete(petId);
          if (mountedRef.current) setPreviewQueueVersion((current) => current + 1);
        });
    }
  }, [previewIds, previews, previewQueueVersion]);

  useEffect(() => {
    setDraftPetId(selected?.id ?? null);
  }, [selected?.id]);

  useEffect(() => {
    const draftIndex = filteredPets.findIndex((pet) => pet.id === draftPet?.id);
    if (draftIndex >= 0) {
      setPageIndex(Math.floor(draftIndex / pageSize));
      return;
    }
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [draftPet?.id, filteredPets, pageCount]);

  useEffect(() => {
    setPageDirection("next");
    setPageIndex(0);
  }, [searchQuery]);

  const goBack = () => {
    setPageDirection("previous");
    setPageIndex((current) => Math.max(0, current - 1));
  };
  const goForward = () => {
    setPageDirection("next");
    setPageIndex((current) => Math.min(pageCount - 1, current + 1));
  };

  return (
    <aside className="picker no-drag" id="pet-picker-panel" aria-label="选择宠物">
      <header className="picker-header">
        <div className="picker-title-block">
          <span className="picker-kicker">Desktop companions</span>
          <h1>选择桌宠</h1>
          <p>挑一个伙伴，陪你留在桌面。</p>
        </div>
        <div className="picker-header-actions">
          <span className="picker-total">{pets.length} 位伙伴</span>
          <label className="launch-at-login-toggle">
            <input
              type="checkbox"
              name="launch-at-login"
              checked={launchAtLogin}
              disabled={isUpdatingLaunchAtLogin}
              onChange={(event) => onLaunchAtLoginChange(event.currentTarget.checked)}
            />
            <span aria-hidden="true" />
            开机自启
          </label>
          <button
            className="pet-library-button"
            type="button"
            title="打开宠物资源文件夹；每个宠物使用一个独立文件夹"
            onClick={onManageLibrary}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M2.5 5.5h5l1.5 2h8.5v7.5a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 15z" />
            </svg>
            管理宠物
          </button>
          <button className="icon-button" type="button" aria-label="关闭宠物选择" onClick={onClose}>
            ×
          </button>
        </div>
      </header>

      <div className="picker-toolbar">
        <label className="picker-search">
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="m12.5 12.5 4 4" />
          </svg>
          <input
            ref={searchInputRef}
            type="search"
            aria-label="搜索宠物"
            placeholder="搜索宠物名字"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
          {searchQuery ? (
            <button
              className="picker-search-clear"
              type="button"
              aria-label="清除搜索"
              onClick={() => setSearchQuery("")}
            >
              清除
            </button>
          ) : null}
        </label>
        <div className="picker-pager" aria-label="宠物分页">
          <span>{filteredPets.length === 0 ? "0 / 0" : `${pageIndex + 1} / ${pageCount}`}</span>
          <button type="button" aria-label="上一页宠物" disabled={!canGoBack} onClick={goBack}>
            ←
          </button>
          <button
            type="button"
            aria-label="下一页宠物"
            disabled={!canGoForward}
            onClick={goForward}
          >
            →
          </button>
        </div>
      </div>

      <section className="picker-gallery" aria-label="宠物列表">
        {filteredPets.length === 0 ? (
          <div className="empty-picker" role="status">
            <span aria-hidden="true">⌕</span>
            <strong>{searchQuery ? "没有找到这位伙伴" : "暂无可用宠物"}</strong>
            <p>{searchQuery ? "换个名字试试，或清除搜索查看全部宠物。" : "请检查内置宠物资源后重试。"}</p>
          </div>
        ) : (
          <div
            className="pet-row"
            key={pageIndex}
            data-direction={pageDirection}
          >
            {visiblePets.map((pet) => {
              const isSelected = pet.id === selected?.id;
              const isDraft = pet.id === draftPet?.id;
              const isSwitching = pet.id === switchingPetId;
              const previewUrl = previews[pet.id];
              const displayName = compactPetName(pet.displayName);
              return (
                <button
                  key={pet.id}
                  type="button"
                  className={`pet-card ${isSelected ? "active" : ""} ${isDraft ? "is-draft" : ""} ${isSwitching ? "is-switching" : ""}`}
                  data-pet-id={pet.id}
                  title={pet.displayName}
                  aria-pressed={isDraft}
                  onClick={() => setDraftPetId(pet.id)}
                >
                  <span className="pet-card-topline">
                    <span>{isSelected ? "桌面中" : isDraft ? "已预览" : pet.faction ?? "伙伴"}</span>
                  </span>
                  <span className="pet-card-preview" aria-hidden="true">
                    {previewUrl ? (
                      <span
                        className="pet-card-sprite"
                        style={{ backgroundImage: `url("${previewUrl}")` }}
                      />
                    ) : (
                      <span className="pet-card-initials">{initialsFor(pet.displayName)}</span>
                    )}
                  </span>
                  <span className="pet-card-copy">
                    <span className="pet-card-name">{displayName}</span>
                    <span className="pet-card-caption">{petCardCaption(pet)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <footer className="picker-selection" aria-live="polite">
        <div className="picker-selection-preview" aria-hidden="true">
          {detailPreviewUrl ? (
            <span
              className="picker-current-sprite"
              style={{ backgroundImage: `url("${detailPreviewUrl}")` }}
            />
          ) : (
            <span className="pet-card-initials">
              {draftPet ? initialsFor(draftPet.displayName) : "?"}
            </span>
          )}
        </div>
        <div className="picker-profile-copy">
          <span>{hasDraftChange ? "准备切换" : "当前桌宠"}</span>
          <strong>{draftPet?.displayName ?? "还没有选择宠物"}</strong>
          <small>{draftPet ? petDetailLine(draftPet) : "从上方选择一位伙伴"}</small>
        </div>
        <div className="picker-current-actions">
          <span>{hasDraftChange ? "确认后才会替换桌面角色" : "点击卡片可以先预览"}</span>
          <button
            type="button"
            disabled={!draftPet || !hasDraftChange || Boolean(switchingPetId)}
            onClick={() => {
              if (!draftPet || !hasDraftChange) return;
              onSelect(draftPet.id);
            }}
          >
            {isSwitchingDraft
              ? "正在切换…"
              : hasDraftChange
                ? "确认使用"
                : draftPet
                  ? "正在使用"
                  : "未选择"}
          </button>
        </div>
      </footer>
    </aside>
  );
}

function petMatchesSearch(pet: PetOption, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = `${pet.displayName} ${pet.id}`.toLowerCase();
  return haystack.includes(normalizedQuery);
}

function compactPetName(name: string): string {
  const normalized = name
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(normalized);
  if (chars.length <= 10) return normalized;
  return `${chars.slice(0, 8).join("")}...`;
}

function petCardCaption(pet: PetOption): string {
  return pet.tags?.[0] ?? pet.author ?? "桌面伙伴";
}

function petDetailLine(pet: PetOption): string {
  return [
    pet.faction,
    pet.author,
    pet.recommendedScale ? `建议 ${Math.round(pet.recommendedScale * 100)}%` : null,
  ].filter(Boolean).slice(0, 2).join(" · ") || "内置桌面伙伴";
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
