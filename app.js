import RiveCanvas, { File } from "@rive-app/canvas-advanced";
import { registerTouchInteractions } from "./registerTouchInteractions";

import MenuRive from "data-url:./menu.riv";
import GameRive from "data-url:./game.riv";

import "./styles.css";

async function main() {
  const riveSetup = RiveCanvas({
    // Loads Wasm bundle
    locateFile: (_) =>
      `https://unpkg.com/@rive-app/canvas-advanced@1.0.91/rive.wasm`,
  });
  const rive = await riveSetup;
  const canvas = document.getElementById("rive-canvas");
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = dpr * width;
  canvas.height = dpr * height;

  const renderer = rive.makeRenderer(canvas);

  // Load in the different files
  const menuBytes = await (await fetch(new Request(MenuRive))).arrayBuffer();
  const gameBytes = await (await fetch(new Request(GameRive))).arrayBuffer();
  const menuFile = await rive.load(new Uint8Array(menuBytes));
  const gameFile = await rive.load(new Uint8Array(gameBytes));

  const menuArtboard = menuFile.artboardByName("Menu");
  const gameArtboard = gameFile.artboardByName("Alt Game");
  let menuSm = new rive.StateMachineInstance(
    menuArtboard.stateMachineByIndex(0),
    menuArtboard
  );
  let gameSm = new rive.StateMachineInstance(
    gameArtboard.stateMachineByIndex(0),
    gameArtboard
  );
  registerTouchInteractions({
    canvas,
    artboard: menuArtboard,
    stateMachines: [menuSm],
    renderer,
    rive,
    fit: rive.Fit.contain,
    alignment: rive.Alignment.center,
  });
  registerTouchInteractions({
    canvas,
    artboard: gameArtboard,
    stateMachines: [gameSm],
    renderer,
    rive,
    fit: rive.Fit.contain,
    alignment: rive.Alignment.center,
  });
  // Get the chosen character for the Game artboard
  let chosenCharacter = "";
  // Game SM Inputs
  let gameCharacterInput;
  let gamePlayInput;
  let hasFired = false;
  let hasPlayedThrough = false;

  // Menu SM Inputs
  let menuResetInput;

  let lastTime = 0;
  let trackedTime = 0;
  let isGameMode = false;

  function renderLoop(time) {
    if (!lastTime) {
      lastTime = time;
    }
    const elapsedTimeMs = time - lastTime;
    const elapsedTimeSec = elapsedTimeMs / 1000;
    lastTime = time;

    renderer.clear();
    if (!isGameMode) {
      menuSm.advance(elapsedTimeSec);
      menuArtboard.advance(elapsedTimeSec);
      const menuStatesChangedCount = menuSm.stateChangedCount();
      const menuStatesChanged = [];
      if (!menuResetInput) {
        let menuInputsCount = menuSm.inputCount();
        for (let i = 0; i < menuInputsCount; i++) {
          if (menuSm.input(i).name === "reset") {
            menuResetInput = menuSm.input(i).asTrigger();
            break;
          }
        }
      }
      for (let i = 0; i < menuStatesChangedCount; i++) {
        menuStatesChanged.push(menuSm.stateChangedNameByIndex(i));
      }
      chosenCharacter = checkGameCharacter(menuStatesChanged);
    }
    if (!!chosenCharacter) {
      if (!isGameMode) {
        isGameMode = true;
      }
      if (!gameCharacterInput || gameCharacterInput?.value === false) {
        for (let i = 0; i < gameSm.inputCount(); i++) {
          if (gameSm.input(i).name === chosenCharacter) {
            gameCharacterInput = gameSm.input(i).asBool();
            gameCharacterInput.value = true;
            console.log(chosenCharacter);
          }
          if (gameSm.input(i).name === "play" && !gamePlayInput) {
            gamePlayInput = gameSm.input(i).asTrigger();
          }
        }
      }
      gameSm.advance(elapsedTimeSec);
      gameArtboard.advance(elapsedTimeSec);
      const gameStatesChangedCount = gameSm.stateChangedCount();
      const gameStatesChanged = [];
      for (let i = 0; i < gameStatesChangedCount; i++) {
        gameStatesChanged.push(gameSm.stateChangedNameByIndex(i));
      }
      if (!hasFired && isGameMode) {
        gamePlayInput.fire();
        hasFired = true;
      }
      // TODO: Cant check Back_Gone bc it clears the Game artboard like one frame too early, and never gets to the Wait state, where we need to do gamePlayInput.fire()
      if (gameStatesChanged.indexOf("Back_Gone") > -1) {
        hasPlayedThrough = true;
        menuResetInput.fire();
      }
      if (gameStatesChanged.indexOf("Wait") > -1 && hasPlayedThrough) {
        gameCharacterInput.value = false;
        chosenCharacter = "";
        isGameMode = false;
        hasFired = false;
      }
    }

    renderer.save();
    if (isGameMode) {
      renderer.align(
        rive.Fit.contain,
        rive.Alignment.center,
        {
          minX: 0,
          minY: 0,
          maxX: canvas.width,
          maxY: canvas.height,
        },
        gameArtboard.bounds
      );
      gameArtboard.draw(renderer);
    } else {
      renderer.align(
        rive.Fit.contain,
        rive.Alignment.center,
        {
          minX: 0,
          minY: 0,
          maxX: canvas.width,
          maxY: canvas.height,
        },
        menuArtboard.bounds
      );
      menuArtboard.draw(renderer);
    }
    renderer.restore();
    rive.requestAnimationFrame(renderLoop);
  }
  let menuRaf = rive.requestAnimationFrame(renderLoop);

  function checkGameCharacter(states) {
    if (states.indexOf("game_idle") > -1) {
      for (let i = 0; i < menuSm.inputCount(); i++) {
        const input = menuSm.input(i);
        switch (input.name) {
          case "turkey":
          case "duck":
          case "chicken":
          case "balloon": {
            if (!!input.asBool().value) {
              return input.name;
            }
          }
          default:
        }
      }
    }
    return "";
  }
}

main();
