export async function runSmokeProbe({
  petWindow,
  phase,
  openControlWindow,
}) {
  const result = await executeProbe(petWindow, rendererSmokeProbe, phase);

  const [firstPickerWindow, pickerWindow] = await Promise.all([
    openControlWindow(),
    openControlWindow(),
  ]);
  const concurrentSameWindow = firstPickerWindow.id === pickerWindow.id;
  const picker = await executeProbe(
    pickerWindow,
    controlPickerSmokeProbe,
    result.selection?.targetPetId ?? null,
  );
  const selection = picker.selection ?? result.selection;
  const controlAccess = await executeProbe(
    pickerWindow,
    controlAccessSmokeProbe,
  );
  const petAccess = await executeProbe(petWindow, petAccessSmokeProbe);
  const controlAliveAfterPetRejections = !pickerWindow.isDestroyed();
  const petBoundsBefore = await waitForWindowBoundsToSettle(petWindow);

  const closedPromise = waitForWindowClosed(pickerWindow);
  const rendererClose = await executeProbe(pickerWindow, controlCloseSmokeProbe);
  await closedPromise;

  const petAlive = !petWindow.isDestroyed();
  const petBoundsAfter = petAlive ? petWindow.getBounds() : null;
  const boundsUnchanged = petAlive &&
    JSON.stringify(petBoundsAfter) === JSON.stringify(petBoundsBefore);

  return {
    ...result,
    ...(selection ? { selection } : {}),
    petWindowAppearance: {
      alwaysOnTop: petWindow.isAlwaysOnTop(),
      ...result.surfaceBackgrounds,
    },
    control: {
      picker,
      access: {
        control: controlAccess,
        pet: petAccess,
        controlAliveAfterPetRejections,
      },
      rendererClose,
      concurrentOpen: {
        sameWindow: concurrentSameWindow,
        firstPickerWindowId: firstPickerWindow.id,
        secondPickerWindowId: pickerWindow.id,
        finalPanel: picker.panel,
      },
      closed: true,
      petAlive,
      boundsUnchanged,
      petBoundsBefore,
      petBoundsAfter,
    },
  };
}

function executeProbe(window, probe, ...args) {
  const serializedArgs = args.map((value) => JSON.stringify(value)).join(",");
  const script = `(${probe.toString()})(${serializedArgs})`;
  return window.webContents.executeJavaScript(script, true);
}

function waitForWindowClosed(window, timeoutMs = 5_000) {
  if (window.isDestroyed()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeListener("closed", onClosed);
      reject(new Error("control_window_close_timeout"));
    }, timeoutMs);
    const onClosed = () => {
      clearTimeout(timeout);
      resolve();
    };
    window.once("closed", onClosed);
  });
}

async function waitForWindowBoundsToSettle(window, timeoutMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  let stableSince = Date.now();
  let serializedBounds = JSON.stringify(window.getBounds());

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const nextSerializedBounds = JSON.stringify(window.getBounds());
    if (nextSerializedBounds !== serializedBounds) {
      serializedBounds = nextSerializedBounds;
      stableSince = Date.now();
      continue;
    }
    if (Date.now() - stableSince >= 100) return window.getBounds();
  }

  return window.getBounds();
}

async function rendererSmokeProbe(phase) {
  const deadline = Date.now() + 5_000;
  while (!document.querySelector("main.stage")) {
    if (document.querySelector("vite-error-overlay")) {
      throw new Error("renderer_vite_error");
    }
    if (Date.now() >= deadline) throw new Error("renderer_root_missing");
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }

  const api = window.desktopPet;
  const requiredMethods = [
    "getStatus",
    "resizeMascot",
    "setState",
  ];
  const missingMethod = requiredMethods.find((name) => typeof api?.[name] !== "function");
  if (missingMethod) throw new Error(`preload_method_missing:${missingMethod}`);
  const petSurface = document.querySelector('[data-avatar-overlay-content-frame="true"]');
  if (!(petSurface instanceof HTMLElement)) throw new Error("renderer_pet_surface_missing");
  const renderedState = () => {
    const pet = petSurface.querySelector(".pet");
    return pet instanceof HTMLElement ? pet.dataset.state ?? null : null;
  };
  const waitForRenderedState = async (expectedState, timeoutMs = 2_000) => {
    const stateDeadline = Date.now() + timeoutMs;
    while (Date.now() < stateDeadline) {
      const state = renderedState();
      if (state === expectedState) return state;
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    throw new Error(`renderer_state_timeout:${expectedState}:${renderedState()}`);
  };
  const rendererInstanceToken = `${Date.now()}:${Math.random()}`;
  petSurface.dataset.smokeRendererInstance = rendererInstanceToken;
  const surfaceBackgrounds = {
    htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    stageBackground: getComputedStyle(document.querySelector("main.stage")).backgroundColor,
    petShellBackground: getComputedStyle(petSurface).backgroundColor,
  };
  const statusBeforeInvalidState = await api.getStatus();
  const resizeHandleRendered = document.querySelector(".resize-handle") instanceof HTMLButtonElement;
  let invalidStateRejected = false;
  let invalidStateError = null;
  try {
    await api.setState("failed", 0);
  } catch (error) {
    invalidStateRejected = true;
    invalidStateError = error instanceof Error ? error.message : String(error);
  }
  const statusAfterInvalidState = await api.getStatus();
  const invalidState = {
    rejected: invalidStateRejected,
    error: invalidStateError,
    stateBefore: statusBeforeInvalidState.state,
    stateAfter: statusAfterInvalidState.state,
    rendererAlive: document.querySelector("main.stage") !== null,
    recoveredState: await api.setState("idle", 0),
  };
  const draggingReturned = await api.setState("running-right", 40);
  const draggingRendered = await waitForRenderedState("running-right");
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  const draggingObserved = (await api.getStatus()).state;
  await api.setState("idle", 0);
  await waitForRenderedState("idle");
  const jumpingReturned = await api.setState("jumping", 80);
  const jumpingObserved = (await api.getStatus()).state;
  const jumpingRendered = await waitForRenderedState("jumping");
  await new Promise((resolve) => window.setTimeout(resolve, 140));
  const jumpingSettled = (await api.getStatus()).state;
  const jumpingSettledRendered = await waitForRenderedState("idle");
  const stateLifecycle = {
    draggingReturned,
    draggingObserved,
    draggingRendered,
    jumpingReturned,
    jumpingObserved,
    jumpingRendered,
    jumpingSettled,
    jumpingSettledRendered,
  };

  if (phase === "restart") {
    const status = await api.getStatus();
    return {
      rendererReady: true,
      preloadAvailable: true,
      rendererUrl: window.location.href,
      rendererInstanceToken,
      surfaceBackgrounds,
      invalidState,
      stateLifecycle,
      resize: {
        handleRendered: resizeHandleRendered,
        persistedWidthPx: status.mascotWidthPx,
      },
      persisted: {
        statusPetId: status.selectedPet?.id ?? null,
        state: status.state,
      },
    };
  }

  const initialStatus = await api.getStatus();
  const resizedWidthPx = await api.resizeMascot(204, true);
  const resizedStatus = await api.getStatus();
  const returnedState = await api.setState("waving", 1_000);
  const stateStatus = await api.getStatus();
  const renderedWavingState = await waitForRenderedState("waving");
  const targetPet = initialStatus.pets.find(
    (pet) => pet.id !== initialStatus.selectedPet?.id,
  ) ?? initialStatus.pets[0];
  if (!targetPet) throw new Error("renderer_pet_list_empty");

  return {
    rendererReady: true,
    preloadAvailable: true,
    rendererUrl: window.location.href,
    rendererInstanceToken,
    surfaceBackgrounds,
    invalidState,
    stateLifecycle,
    resize: {
      handleRendered: resizeHandleRendered,
      initialWidthPx: initialStatus.mascotWidthPx,
      returnedWidthPx: resizedWidthPx,
      statusWidthPx: resizedStatus.mascotWidthPx,
    },
    initial: {
      state: initialStatus.state,
      petCount: initialStatus.pets.length,
      statusPetId: initialStatus.selectedPet?.id ?? null,
    },
    state: {
      returned: returnedState,
      observed: stateStatus.state,
      rendered: renderedWavingState,
    },
    selection: {
      targetPetId: targetPet.id,
    },
  };
}

async function controlAccessSmokeProbe() {
  const api = window.desktopPet;
  let appCloseRejected = false;
  let appCloseError = null;
  try {
    await api.close();
  } catch (error) {
    appCloseRejected = true;
    appCloseError = error instanceof Error ? error.message : String(error);
  }
  return {
    appCloseRejected,
    appCloseError,
    rendererAlive: document.querySelector("main.stage") !== null,
  };
}

async function petAccessSmokeProbe() {
  const api = window.desktopPet;
  let listPetsRejected = false;
  let listPetsError = null;
  try {
    await api.listPets();
  } catch (error) {
    listPetsRejected = true;
    listPetsError = error instanceof Error ? error.message : String(error);
  }

  let controlCloseRejected = false;
  let controlCloseError = null;
  try {
    await api.closeControlWindow();
  } catch (error) {
    controlCloseRejected = true;
    controlCloseError = error instanceof Error ? error.message : String(error);
  }

  return {
    listPetsRejected,
    listPetsError,
    controlCloseRejected,
    controlCloseError,
    rendererAlive: document.querySelector("main.stage") !== null,
  };
}

async function controlCloseSmokeProbe() {
  const api = window.desktopPet;
  if (typeof api?.closeControlWindow !== "function") {
    throw new Error("control_close_api_missing");
  }
  const searchParams = new URLSearchParams(window.location.search);
  window.setTimeout(() => {
    void api.closeControlWindow().catch(() => undefined);
  }, 0);
  return {
    requested: true,
    surface: searchParams.get("surface"),
    panel: searchParams.get("panel"),
  };
}

async function controlPickerSmokeProbe(targetPetId) {
  const selector = '[data-control-panel="picker"] #pet-picker-panel';
  const deadline = Date.now() + 5_000;
  while (!document.querySelector(selector) || !document.querySelector(".pet-row")) {
    if (document.querySelector("vite-error-overlay")) {
      throw new Error("control_picker_vite_error");
    }
    if (Date.now() >= deadline) throw new Error("control_picker_dom_missing");
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }

  const api = window.desktopPet;
  const requiredMethods = [
    "getStatus",
    "listPets",
    "closeControlWindow",
  ];
  const missingMethod = requiredMethods.find((name) => typeof api?.[name] !== "function");
  if (missingMethod) throw new Error(`control_preload_method_missing:${missingMethod}`);

  const searchParams = new URLSearchParams(window.location.search);
  const libraryPets = await api.listPets();
  let selection = null;
  if (targetPetId) {
    const pets = await api.listPets();
    const currentStatus = await api.getStatus();
    const visibleCards = [...document.querySelectorAll("button.pet-card")].filter(
      (button) => button instanceof HTMLButtonElement && Boolean(button.dataset.petId),
    );
    const card = visibleCards.find((button) => button.dataset.petId === targetPetId) ??
      visibleCards.find((button) => button.dataset.petId !== currentStatus.selectedPet?.id);
    if (!(card instanceof HTMLButtonElement)) {
      throw new Error(`control_picker_card_missing:${targetPetId}`);
    }
    targetPetId = card.dataset.petId;
    const targetPet = pets.find((pet) => pet.id === targetPetId);
    if (!targetPet) throw new Error(`control_picker_target_missing:${String(targetPetId)}`);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    card.click();

    let confirmButton = null;
    const confirmDeadline = Date.now() + 2_000;
    while (Date.now() < confirmDeadline) {
      const candidate = document.querySelector(".picker-current-actions button");
      if (candidate instanceof HTMLButtonElement && !candidate.disabled) {
        confirmButton = candidate;
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 20));
    }
    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error(`control_picker_confirm_unavailable:${targetPetId}`);
    }
    confirmButton.click();

    let selectedStatus = await api.getStatus();
    let selectedCardActive = false;
    const selectionDeadline = Date.now() + 5_000;
    while (Date.now() < selectionDeadline) {
      selectedStatus = await api.getStatus();
      selectedCardActive = [...document.querySelectorAll("button.pet-card.active")].some(
        (button) => button instanceof HTMLButtonElement && button.title === targetPet.displayName,
      );
      if (
        selectedStatus.selectedPet?.id === targetPetId &&
        selectedCardActive
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
    selection = {
      targetPetId,
      statusPetId: selectedStatus.selectedPet?.id ?? null,
      cardClicked: true,
      confirmClicked: true,
      selectedCardActive,
    };
  }
  return {
    rendererUrl: window.location.href,
    surface: searchParams.get("surface"),
    panel: searchParams.get("panel"),
    rendered: true,
    preloadAvailable: true,
    petRowCount: document.querySelectorAll(".pet-row").length,
    petCardCount: document.querySelectorAll("button.pet-card").length,
    headingText: document.querySelector(".picker-title-block h1")?.textContent?.trim() ?? null,
    selectionDockRendered: document.querySelector(".picker-selection") !== null,
    libraryButtonRendered: document.querySelector("button.pet-library-button") !== null,
    launchAtLoginRendered: document.querySelector("input[name=launch-at-login]") !== null,
    userPetCount: libraryPets.filter((pet) => pet.source === "user").length,
    settingsPanelAbsent: document.querySelector("#pet-settings-panel") === null,
    closeApiAvailable: true,
    selection,
  };
}
