import { useCallback, useEffect, useState } from "react";
import { desktopPetApi, localPreviewStatus } from "../desktopPetApi";
import type { PetStatus } from "../types";
import { PetPicker } from "./PetPicker";

export function ControlSurface() {
  const [status, setStatus] = useState<PetStatus>(localPreviewStatus);
  const [switchingPetId, setSwitchingPetId] = useState<string | null>(null);

  const closeControlSurface = useCallback(() => {
    void desktopPetApi.closeControlWindow();
  }, []);

  const openPetLibrary = useCallback(() => {
    void desktopPetApi.openPetLibrary();
  }, []);

  useEffect(() => {
    void desktopPetApi.getStatus().then(setStatus);
    return desktopPetApi.onStatusChanged(setStatus);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeControlSurface();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeControlSurface]);

  useEffect(() => {
    if (switchingPetId && !status.pets.some((pet) => pet.id === switchingPetId)) {
      setSwitchingPetId(null);
    }
  }, [status.pets, switchingPetId]);

  const selectPet = async (id: string) => {
    setSwitchingPetId(id);
    try {
      const pet = await desktopPetApi.selectPet(id);
      if (!pet) return;
      setStatus((current) => ({ ...current, selectedPet: pet }));
    } finally {
      setSwitchingPetId(null);
    }
  };

  return (
    <main className="stage">
      <section className="pet-shell" data-control-panel="picker">
        <PetPicker
          pets={status.pets}
          selected={status.selectedPet}
          switchingPetId={switchingPetId}
          onClose={closeControlSurface}
          onManageLibrary={openPetLibrary}
          onSelect={(id) => void selectPet(id)}
        />
      </section>
    </main>
  );
}
