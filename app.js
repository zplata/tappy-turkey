import RiveCanvas from "@rive-app/canvas-advanced";
import { registerTouchInteractions } from "./registerTouchInteractions";

import MenuRive from "data-url:./menu.riv";
import GameRive from "data-url:./game.riv";

import "./styles.css";

async function main() {
  // 1. Getting access to low-level Rive APIs through WASM
  const rive = await RiveCanvas({
    // Loads Wasm bundle
    locateFile: (_) =>
      `https://unpkg.com/@rive-app/canvas-advanced@1.0.91/rive.wasm`,
  });

  // 2. Setting canvas area
  const canvas = document.getElementById("rive-canvas");
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = dpr * width;
  canvas.height = dpr * height;

  // 3. Construct the renderer for our Canvas to draw on
  const renderer = rive.makeRenderer(canvas);

  // 4. Load in our Rive files
  const menuBytes = await (await fetch(new Request(MenuRive))).arrayBuffer();
  const gameBytes = await (await fetch(new Request(GameRive))).arrayBuffer();
  const menuFile = await rive.load(new Uint8Array(menuBytes));
  const gameFile = await rive.load(new Uint8Array(gameBytes));

  // 5. Create instances for the relevant Artboards and State Machines we'll use in our Rive scene
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

  // 6. Set up Rive listeners using Web API Events
  const setupListeners = registerRiveListeners(
    canvas,
    renderer,
    rive,
    rive.Fit.contain,
    rive.Alignment.center
  );
  setupListeners(menuArtboard, menuSm);
  setupListeners(gameArtboard, gameSm);

  // Track the name of the chosen character
  let chosenCharacter = "";
  // Determine if we're using the Game artboard or Menu artboard
  let isGameMode = false;

  // Game SM Inputs
  let gameCharacterInput;
  let gamePlayInput;
  for (let i = 0; i < gameSm.inputCount(); i++) {
    if (gameSm.input(i).name === "play") {
      gamePlayInput = gameSm.input(i).asTrigger();
    }
  }

  // Menu SM Inputs
  let menuResetInput; // Trigger to get back to main Menu
  let menuInputsCount = menuSm.inputCount();
  for (let i = 0; i < menuInputsCount; i++) {
    if (menuSm.input(i).name === "reset") {
      menuResetInput = menuSm.input(i).asTrigger();
    }
  }

  // Track whether the "Play" button was clicked on the Menu
  let hasPlayStarted = false;

  // Track whether we have played thru the game and ended
  let hasPlayedThrough = false;

  // Create variables to track current and high score
  const scoreEl = document.getElementsByClassName("score")[0];
  const highScoreEl = document.getElementsByClassName("high-score")[0];
  let score = -1; // Start at -1 because it hits the "Hit" state once.
  let highScore = 0;

  // Track the timestamp of the last rAF loop
  let lastTime = 0;

  function renderLoop(time) {
    if (!lastTime) {
      lastTime = time;
    }
    const elapsedTimeMs = time - lastTime;
    const elapsedTimeSec = elapsedTimeMs / 1000;
    lastTime = time;

    // 7. Advance relevant state machines and artboards by elapsed time since last draw
    renderer.clear();
    menuSm.advance(elapsedTimeSec);
    menuArtboard.advance(elapsedTimeSec);

    // Grab the state name of the chosen character from Menu
    if (!isGameMode && !hasPlayStarted) {
      const menuStatesChangedCount = menuSm.stateChangedCount();
      const menuStatesChanged = [];
      for (let i = 0; i < menuStatesChangedCount; i++) {
        menuStatesChanged.push(menuSm.stateChangedNameByIndex(i));
      }
      chosenCharacter = checkGameCharacter(menuStatesChanged);
    }

    if (chosenCharacter) {
      // Track that "Play" button has been clicked, and should switch to draw the Game artboard
      if (!isGameMode && !hasPlayStarted) {
        // Let the Menu artboard animation play out before transitioning to the Game artboard
        setTimeout(() => {
          isGameMode = true;
          gamePlayInput.fire();
        }, 500);
        hasPlayStarted = true;
      }

      // Set the Game state machine input for the character to play with based on the chosenCharacter
      if (
        (!gameCharacterInput || gameCharacterInput?.value === false) &&
        isGameMode
      ) {
        for (let i = 0; i < gameSm.inputCount(); i++) {
          if (gameSm.input(i).name === chosenCharacter) {
            gameCharacterInput = gameSm.input(i).asBool();
            gameCharacterInput.value = true;
            console.log(chosenCharacter);
          }
        }
      }

      // 7. Advance relevant state machines and artboards by elapsed time since last draw
      gameSm.advance(elapsedTimeSec);
      gameArtboard.advance(elapsedTimeSec);

      // Track states changed as the Game state machine plays
      const gameStatesChangedCount = gameSm.stateChangedCount();
      const gameStatesChanged = [];
      for (let i = 0; i < gameStatesChangedCount; i++) {
        gameStatesChanged.push(gameSm.stateChangedNameByIndex(i));
      }

      // Wait for this state to update scores after losing, and to trigger the reset input
      // on the Menu state machine
      if (gameStatesChanged.indexOf("Back_Gone") > -1) {
        hasPlayedThrough = true;
        highScoreEl.innerHTML = `High Score: ${highScore}`;
        scoreEl.innerHTML = `Score: ${Math.max(score, 0)}`;
        menuResetInput.fire();
      }
      // Need to watch for "Wait" state bc thats when we can officailly restart our game state variables
      if (gameStatesChanged.indexOf("Wait") > -1 && hasPlayedThrough) {
        gameCharacterInput.value = false;
        chosenCharacter = "";
        isGameMode = false; // This brings it back to displaying the Menu artboard
        hasPlayStarted = false;
      }

      // Bump the score everytime the character gets bumped
      if (gameStatesChanged.indexOf("Hit") > -1) {
        score++;
        console.log(score);
        scoreEl.innerHTML = `Score: ${Math.max(score, 0)}`;
      }

      // In the lose state, record the high score, and reset the current score
      if (gameStatesChanged.indexOf("End") > -1) {
        if (score > highScore) {
          highScore = score;
        }
        score = -1;
        highScoreEl.innerHTML = `High Score: ${
          highScore > score ? highScore : score
        }`;
      }
    }

    // 8. Align the Rive on the canvas and draw the relevant artboard (Menu or Game)
    renderer.save();
    renderer.align(
      rive.Fit.contain,
      rive.Alignment.center,
      {
        minX: 0,
        minY: 0,
        maxX: canvas.width,
        maxY: canvas.height,
      },
      isGameMode ? gameArtboard.bounds : menuArtboard.bounds
    );
    isGameMode ? gameArtboard.draw(renderer) : menuArtboard.draw(renderer);
    renderer.restore();
    rive.requestAnimationFrame(renderLoop);
  }
  rive.requestAnimationFrame(renderLoop);

  // Return input name of the character chosen from the Menu when "Play" is clicked
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

function registerRiveListeners(canvas, renderer, rive, fit, alignment) {
  return function (artboard, stateMachine) {
    registerTouchInteractions({
      canvas,
      artboard,
      stateMachines: [stateMachine],
      renderer,
      rive,
      fit,
      alignment,
    });
  };
}

main();
