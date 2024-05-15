"use strict";

var totalMissingCapturesBands = [];
var totalMissingCapturesIrradiance = [];

document
  .getElementById("documentationBtn")
  .addEventListener("click", async (event) => {
    await window.api.externalDoc();
  });

document.getElementById("choose").addEventListener("click", async (event) => {
  // clear any error messages if any
  const msg = document.querySelector(".danger-alert");
  if (msg !== null) {
    // console.log(msg);
    msg.remove();
  }

  // disable browse button
  document.querySelector("#choose").style.pointerEvents = "none";

  // send signal to backend
  const validDir = await window.api.browseFolder();

  if (validDir === "enable") {
    // enable browse button
    document.querySelector("#choose").style.pointerEvents = "auto";

    return;
  }

  // directory wrong
  else if (validDir === "wrongDir") {
    addErrorMessage();

    // enable browse button
    document.querySelector("#choose").style.pointerEvents = "auto";

    return;
  }

  // No images found
  else if (validDir === "noImages") {
    addErrorMessage("No images were found in the selected directory");

    // enable browse button
    document.querySelector("#choose").style.pointerEvents = "auto";

    return;
  }

  // No images found
  else if (validDir.includes("noDir")) {
    addErrorMessage(`Directory ${validDir.split("!@#!")[1]} doesn't exist`);

    // enable browse button
    document.querySelector("#choose").style.pointerEvents = "auto";

    return;
  }

  // directory is valid, proceed with processing
  else if (validDir === "success") {
    /*************************************
     * clear previous results if any
     *************************************/
    totalMissingCapturesBands = [];
    totalMissingCapturesIrradiance = [];

    // update status
    document.getElementById("processingStatus").innerText =
      "Waiting on imagery directory";

    // remove spinner
    const spinnerRmv = document.querySelector(".circle-loader");
    if (spinnerRmv != null) {
      spinnerRmv.remove();
    }

    let bandParent = document.querySelector("#bandResults");
    let calibrationParent = document.querySelector("#calibrationResults");
    let irradianceParent = document.querySelector("#irradianceResults");
    let modalButton1 = document.querySelector("#viewImage1");
    let modalButton2 = document.querySelector("#viewImage2");
    let modalImg1 = document.querySelector("#viewImageContent1");
    let modalImg2 = document.querySelector("#viewImageContent2");
    let reflyDiv = document.querySelector("#refly");
    let mapsDiv = document.querySelector("#maps");
    let warningDiv = document.querySelector("#warningBoxMsgs");
    let endingPar = document.querySelector("#endingP");

    try {
      bandParent.replaceChildren();
      calibrationParent.replaceChildren();
      irradianceParent.replaceChildren();
      modalButton1.replaceChildren();
      modalButton2.replaceChildren();
      modalImg1.replaceChildren();
      modalImg2.replaceChildren();
      reflyDiv.replaceChildren();
      mapsDiv.replaceChildren();
      // warningDiv.replaceChildren();

      // remove last paragraph
      if (endingPar !== null) {
        endingPar.remove();
      }

      if (warningDiv !== null) {
        warningDiv.remove();
      }
    } catch (error) {
      console.error(`remove reset error: ${error}`);
    }

    // scroll into processing view
    location.href = "#";
    location.href = "#processingContainer";

    // add spinner
    const spinner = document.createElement("div");
    spinner.className = "circle-loader";
    const check = document.createElement("div");
    check.className = "checkmark1 draw";

    spinner.appendChild(check);
    document.getElementById("processing").appendChild(spinner);

    let readImageResult = "";
    let bandResult = "";
    let calibrationResult = "";
    let irradianceResult = "";
    let plotMapResult = "";
    let exif = "";

    // Update processing status
    document.getElementById("processingStatus").innerText =
      "Reading image metadata";

    // signal backend to start processing bands
    readImageResult = await window.api.backendFunc("read");

    // Update processing status
    document.getElementById("processingStatus").innerText = "Checking bands";

    // signal backend to start processing bands
    bandResult = await window.api.backendFunc("bands");

    // Update processing status
    document.getElementById("processingStatus").innerText =
      "Checking targets and irradiance data";

    // signal backend to start processing exif
    exif = await window.api.backendFunc("exif");
    // console.log(exif);
    calibrationResult = exif[0];
    irradianceResult = exif[1];

    // Update processing status
    document.getElementById("processingStatus").innerText =
      "Creating satellite maps";

    // signal backend to start processing plot function
    plotMapResult = await window.api.backendFunc("plot");

    // console.log("band result:", bandResult);
    // console.log("calibration result:", calibrationResult);
    // console.log("irradiance result:", irradianceResult);
    // console.log("plotMap result:", plotMapResult);
    // console.log("------------------------");

    // Update processing status and spinner
    document.getElementById(
      "processingStatus"
    ).innerText = `Done — finished in ${(
      parseFloat(readImageResult[readImageResult.length - 2]) +
      parseFloat(bandResult[bandResult.length - 2]) +
      parseFloat(calibrationResult[calibrationResult.length - 2]) +
      parseFloat(plotMapResult[plotMapResult.length - 2])
    ).toFixed(2)} seconds`;

    // stop spinning circle
    toggleCheckmark();

    const checkmark = document.createElement("span");
    const checkmarkCircle = document.createElement("div");
    const checkmarkStem = document.createElement("div");
    const checkmarKick = document.createElement("div");

    checkmark.className = "checkmark";
    checkmarkCircle.className = "checkmark_circle";
    checkmarkStem.className = "checkmark_stem";
    checkmarKick.className = "checkmark_kick";

    checkmark.appendChild(checkmarkCircle);
    checkmark.appendChild(checkmarkStem);
    checkmark.appendChild(checkmarKick);

    // scroll into results view
    location.href = "#";
    location.href = "#resultsContainer";

    /*************************************
     * Processing output from missing bands function
     *************************************/

    // Case 1: Wrong directory selected
    if (bandResult[bandResult.length - 1] === "wrong_dir") {
      // Display wrong directory error message
      addErrorMessage();

      // enable browse button
      document.querySelector("#choose").style.pointerEvents = "auto";

      return;
    } else {
      validateBands(bandResult);
    }

    /*************************************
     * Processing output from missing targets function
     *************************************/
    validateTargets(calibrationResult);

    /*************************************
     * Processing output from missing irradiance function
     *************************************/
    validateIrrandiance(irradianceResult);

    /*************************************
     * Processing output from plotMap function
     *************************************/
    validatePlots(plotMapResult);

    /*************************************
     * Check if missing Imgs > 4% (need to refly)
     *************************************/
    if (
      bandResult[bandResult.length - 1] === "missing" ||
      irradianceResult[irradianceResult.length - 1] === "missing"
    ) {
      const totalCaptures = bandResult[bandResult.length - 3];
      const totalMissingCaptures = [
        ...new Set([
          ...totalMissingCapturesBands,
          ...totalMissingCapturesIrradiance,
        ]),
      ].length;

      // console.log(totalCaptures);
      // console.log(totalMissingCaptures);
      // console.log(totalMissingCapturesBands);
      // console.log(totalMissingCapturesIrradiance);

      // check if more than threshold (doing 4% [instead of Pix4dmapper's 5%] to be on the safe side)
      if (totalMissingCaptures > parseInt(0.04 * totalCaptures)) {
        // add paragraph to refly
        const p = document.createElement("p");
        p.innerText = `Too many missing captures detected. Please refly the field.`;
        p.className = "missing";
        // p.style.color = "#e3a801";
        document.getElementById("refly").appendChild(p);
      }
    }

    // add last paragraph (to check more flight)
    const endingP = document.createElement("p");
    const anchorBtn = document.createElement("a");

    endingP.style.textAlign = "center";
    endingP.style.fontWeight = "500";
    anchorBtn.href = "#step_1";
    anchorBtn.style.fontWeight = "bold";

    endingP.id = "endingP";
    anchorBtn.id = "endingAnchor";
    endingP.innerText = "Want to check another flight? ";
    anchorBtn.innerText = "Browse another folder.";

    endingP.appendChild(anchorBtn);
    document.querySelector("#step_3").appendChild(endingP);

    // enable browse button
    document.querySelector("#choose").style.pointerEvents = "auto";
  }
});

function validateBands(bandResult) {
  // Case 2: Missing bands detected
  if (bandResult[bandResult.length - 1] === "missing") {
    // Add a crossmark
    const crossmark = document.createElement("span");
    crossmark.className = "close-x";
    document.getElementById("bandResults").appendChild(crossmark);

    // create limited height div
    const limitedDiv = document.createElement("div");
    limitedDiv.className = "limited";
    limitedDiv.id = "bandResultsLimited";
    document.getElementById("bandResults").appendChild(limitedDiv);

    // Add the missing sets
    for (let i = 0; i < bandResult.length - 3; i++) {
      let p = document.createElement("p");
      p.className = "missing";
      p.innerText = bandResult[i][0];
      document.getElementById("bandResultsLimited").appendChild(p);

      // update missing counter
      totalMissingCapturesBands.push(bandResult[i][2]);
    }
  }

  // Case 3: Success
  else if (bandResult[bandResult.length - 1] === "success") {
    const checkmark = document.createElement("span");
    const checkmarkCircle = document.createElement("div");
    const checkmarkStem = document.createElement("div");
    const checkmarKick = document.createElement("div");

    checkmark.className = "checkmark";
    checkmarkCircle.className = "checkmark_circle";
    checkmarkStem.className = "checkmark_stem";
    checkmarKick.className = "checkmark_kick";

    checkmark.appendChild(checkmarkCircle);
    checkmark.appendChild(checkmarkStem);
    checkmark.appendChild(checkmarKick);

    document.getElementById("bandResults").appendChild(checkmark);
  }

  // Case 4: Unexpected behaviour
  else {
    // Add a crossmark
    const crossmark = document.createElement("span");
    crossmark.className = "close-x";
    document.getElementById("bandResults").appendChild(crossmark);

    // create limited height div
    const limitedDiv = document.createElement("div");
    limitedDiv.className = "limited";
    limitedDiv.id = "bandResultsLimited";
    document.getElementById("bandResults").appendChild(limitedDiv);

    let p = document.createElement("p");
    p.className = "missing";
    p.innerText = "Unexpected error occured";
    document.getElementById("bandResultsLimited").appendChild(p);
  }
}

function validateTargets(calibrationResult) {
  if (calibrationResult[calibrationResult.length - 1] !== "unexpected") {
    let missingFlag = false;
    let completeFlag = false;
    // let exifFlag = false;
    let unexpectedFlag = false;

    for (
      let i = 0;
      i < calibrationResult[calibrationResult.length - 1].length;
      i++
    ) {
      if (calibrationResult[calibrationResult.length - 1][i] === "missing") {
        missingFlag = true;
      } else if (
        calibrationResult[calibrationResult.length - 1][i] === "complete"
      ) {
        completeFlag = true;
      }
      // else if (
      //   calibrationResult[calibrationResult.length - 1][i] === "no_exif"
      // ) {
      //   exifFlag = true;
      // }
      else {
        unexpectedFlag = true;
      }
    }

    // Case 1: Success
    if (completeFlag && !missingFlag && !unexpectedFlag) {
      // Add a checkmark
      const checkmark = document.createElement("span");
      const checkmarkCircle = document.createElement("div");
      const checkmarkStem = document.createElement("div");
      const checkmarKick = document.createElement("div");

      checkmark.className = "checkmark";
      checkmarkCircle.className = "checkmark_circle";
      checkmarkStem.className = "checkmark_stem";
      checkmarKick.className = "checkmark_kick";

      // checkmark.style.display = "none";

      checkmark.appendChild(checkmarkCircle);
      checkmark.appendChild(checkmarkStem);
      checkmark.appendChild(checkmarKick);
      document.getElementById("calibrationResults").appendChild(checkmark);
    }

    // Case 2: targets are present but somes capture(s) contains missing bands
    else if (missingFlag && completeFlag && !unexpectedFlag) {
      let message = `Calibration targets detected but one or more captures contain missing bands. \
      Please ensure that the raw imagery contains at least one clear capture of the calibration targets.`;

      // add warning icon
      const warningIcon = document.createElement("i");
      warningIcon.className = "fa fa-exclamation-circle";
      warningIcon.style.color = "#e3a801";
      warningIcon.style.fontSize = "2em";
      // warningIcon.style.margin = "0.3em"

      document.getElementById("calibrationResults").appendChild(warningIcon);

      // create limited height div
      const limitedDiv = document.createElement("div");
      limitedDiv.className = "limited";
      limitedDiv.id = "calibrationResultsLimited";
      document.getElementById("calibrationResults").appendChild(limitedDiv);

      // Add description paragraph
      const p = document.createElement("p");
      p.className = "missing";
      p.style.color = "#e3a801";
      p.innerText = message;
      document.getElementById("calibrationResultsLimited").appendChild(p);
    } else {
      let message;

      // // Case 3: No EXIF data
      // if (exifFlag) {
      //   message = "No EXIF (metadata) detected in one or more images";
      // }

      // Case 4: Missing targets detected
      if (calibrationResult[calibrationResult.length - 1].length === 0) {
        message =
          "Missing calibration targets detected. Please double check the raw imagery.";
      }

      // Case 5: targets are present but the capture contains missing bands
      else if (missingFlag && !unexpectedFlag) {
        message =
          "Calibration targets detected but all captures contain missing bands.";
      }

      // Case 6: Unexpected behaviour
      else if (unexpectedFlag) {
        message = "Unexpected error occured";
      }
      // Add a crossmark
      const crossmark = document.createElement("span");
      crossmark.className = "close-x";
      document.getElementById("calibrationResults").appendChild(crossmark);

      // create limited height div
      const limitedDiv = document.createElement("div");
      limitedDiv.className = "limited";
      limitedDiv.id = "calibrationResultsLimited";
      document.getElementById("calibrationResults").appendChild(limitedDiv);

      // Add description paragraph
      const p = document.createElement("p");
      p.className = "missing";
      p.innerText = message;
      document.getElementById("calibrationResultsLimited").appendChild(p);
    }

    // Check for warnings
    if (
      calibrationResult[0].noExif.length !== 0 ||
      calibrationResult[0].corrupted.length !== 0
    ) {
      // Create 'Additional Warnings" container
      const warningsBox = document.createElement("div");
      const warningHeader = document.createElement("h4");

      warningsBox.className = "results warningBox";
      warningsBox.id = "warningBoxMsgs";
      warningHeader.className = "section__title warningHeader";

      warningHeader.innerText = "Additional Warnings";

      warningsBox.appendChild(warningHeader);

      if (calibrationResult[0].noExif.length !== 0) {
        for (const warning of calibrationResult[0].noExif) {
          // Add warning
          const p = document.createElement("p");
          const imgSpan = document.createElement("span");

          // set id as absolute path of image
          imgSpan.id = warning;
          imgSpan.innerText = `${warning.split("/").reverse()[0]}`; // img file name

          p.className = "missing";
          p.style.color = "black";
          p.appendChild(imgSpan);
          // p.innerText = " has missing metadata";
          warningsBox.appendChild(p);
        }
      }

      if (calibrationResult[0].corrupted.length !== 0) {
        for (const warning of calibrationResult[0].corrupted) {
          // Add warning
          const p = document.createElement("p");
          const imgSpan = document.createElement("span");

          // set id as absolute path of image
          imgSpan.id = warning;
          imgSpan.innerText = `${warning.split("\\").reverse()[0]}`; // img file name
          let textNode = document.createTextNode(" is corrupted");

          p.className = "missing";
          p.style.color = "black";

          imgSpan.className = "imgLink";

          p.appendChild(imgSpan);
          p.appendChild(textNode);

          // console.log(p.childNodes);
          warningsBox.appendChild(p);

          // add event listener to open image files
          imgSpan.addEventListener("click", async (event) => {
            await window.api.openFile(warning);
          });
        }
      }

      // add warning box to document
      document
        .querySelector("#step_3")
        .insertBefore(warningsBox, document.querySelector("#refly"));
    }
  }

  // unexpected crash
  else {
    // Add a crossmark
    const crossmark = document.createElement("span");
    crossmark.className = "close-x";
    document.getElementById("calibrationResults").appendChild(crossmark);

    // create limited height div
    const limitedDiv = document.createElement("div");
    limitedDiv.className = "limited";
    limitedDiv.id = "calibrationResultsLimited";
    document.getElementById("calibrationResults").appendChild(limitedDiv);

    // Add description paragraph
    const p = document.createElement("p");
    p.className = "missing";
    p.innerText = "Unexpected error occured";
    document.getElementById("calibrationResultsLimited").appendChild(p);
  }
}

function validateIrrandiance(irradianceResult) {
  // Case 1: Success
  if (irradianceResult[irradianceResult.length - 1] === "success") {
    // Add a checkmark
    const checkmark = document.createElement("span");
    const checkmarkCircle = document.createElement("div");
    const checkmarkStem = document.createElement("div");
    const checkmarKick = document.createElement("div");

    checkmark.className = "checkmark";
    checkmarkCircle.className = "checkmark_circle";
    checkmarkStem.className = "checkmark_stem";
    checkmarKick.className = "checkmark_kick";

    checkmark.appendChild(checkmarkCircle);
    checkmark.appendChild(checkmarkStem);
    checkmark.appendChild(checkmarKick);
    document.getElementById("irradianceResults").appendChild(checkmark);
  }

  // Case 2: Missing irradiance detected
  else if (irradianceResult[irradianceResult.length - 1] === "missing") {
    // Add a crossmark
    const crossmark = document.createElement("span");
    crossmark.className = "close-x";
    document.getElementById("irradianceResults").appendChild(crossmark);

    // create limited height div
    const limitedDiv = document.createElement("div");
    limitedDiv.className = "limited";
    limitedDiv.id = "irradianceResultsLimited";
    document.getElementById("irradianceResults").appendChild(limitedDiv);

    // Add the missing captures
    for (let i = 0; i < irradianceResult.length - 2; i++) {
      let p = document.createElement("p");
      p.className = "missing";
      p.innerText = irradianceResult[i][0];
      document.getElementById("irradianceResultsLimited").appendChild(p);

      // update missing counter
      // totalMissingIrradiance += 1;
      totalMissingCapturesIrradiance.push(irradianceResult[i][1]);
    }
  }

  // Case 3: Unexpected behaviour
  else {
    const message = "Unexpected error occured";

    // Add a crossmark
    const crossmark = document.createElement("span");
    crossmark.className = "close-x";
    document.getElementById("irradianceResults").appendChild(crossmark);

    // create limited height div
    const limitedDiv = document.createElement("div");
    limitedDiv.className = "limited";
    limitedDiv.id = "irradianceResultsLimited";
    document.getElementById("irradianceResults").appendChild(limitedDiv);

    // Add description paragraph
    const p = document.createElement("p");
    p.className = "missing";
    p.innerText = message;
    document.getElementById("irradianceResultsLimited").appendChild(p);
  }
}

function validatePlots(plotMapResult) {
  // Case 1: Success
  if (plotMapResult[plotMapResult.length - 1].includes("success")) {
    // create buttons and images
    const div1 = document.createElement("div");
    const div2 = document.createElement("div");
    const img1 = document.createElement("img");
    const img2 = document.createElement("img");

    // assign class
    div1.className = "button--secondary";
    div2.className = "button--secondary";

    div1.style.pointerEvents = "auto";
    div2.style.pointerEvents = "auto";

    div1.innerText = "View Image 1";
    div2.innerText = "View Image 2";

    img1.className = "mapPlots";
    img2.className = "mapPlots";

    // set image src to python's output
    img1.src = plotMapResult[0][0];
    img2.src = plotMapResult[0][1];

    // append divs/imgs
    document.querySelector("#viewImage1").appendChild(div1);
    document.querySelector("#viewImage2").appendChild(div2);
    document.querySelector("#viewImageContent1").appendChild(img1);
    document.querySelector("#viewImageContent2").appendChild(img2);

    // check if some images were skipped due to missing GPS
    if (plotMapResult[plotMapResult.length - 1].includes("gps")) {
      const p = document.createElement("p");
      p.innerText = `Note: One or more images were not plotted due to not having GPS coordinates.`;
      p.className = "borderBottomErrors";
      p.style.color = "#e3a801";
      document.querySelector("#maps").appendChild(p);
    }
  } else {
    let message;
    // Case 2: fail -- maps cant be created, could possibly be internet connection
    if (plotMapResult[plotMapResult.length - 1].includes("fail")) {
      message = `Sorry, satellite maps can't be created. Please make sure that the directory contains all flight images and \
      your device is connected to the Internet then try again.`;
    } else {
      message = `Sorry, satellite maps can't be created due to an unexpected error.`;
    }

    const p = document.createElement("p");
    p.innerText = message;
    p.className = "borderBottomErrors";
    document.querySelector("#maps").appendChild(p);
  }
}

function addErrorMessage(message) {
  const newDiv = document.createElement("div");
  const newHeader = document.createElement("h3");
  const newAnchor = document.createElement("a");

  newDiv.className = "alert danger-alert";
  newHeader.style.marginLeft = "10px";
  newHeader.style.fontSize = "1em";
  if (message) newHeader.innerText = message;
  else newHeader.innerText = "Wrong Directory!";
  newAnchor.className = "close";
  newAnchor.innerText = "x";

  newAnchor.addEventListener("click", (event) => {
    fadeOut(event.target.parentNode);
  });

  newDiv.appendChild(newHeader);
  newDiv.appendChild(newAnchor);

  const browseBtn = document.getElementById("chooseDiv");
  const parentNode = browseBtn.parentNode;
  document.getElementById("step_1").insertBefore(newDiv, browseBtn);

  // console.log("added error message");
}

async function fadeOut(node) {
  const style = node.style;
  style.opacity = 1;
  const promise = await new Promise((resolve, reject) => {
    (function fade() {
      (style.opacity -= 0.1) < 0 ? resolve(true) : setTimeout(fade, 30);
    })();
  });

  node.remove();
}

function toggleCheckmark() {
  const checkmark = document.querySelector(".checkmark1");
  const display = window.getComputedStyle(checkmark).display;

  document.querySelector(".circle-loader").classList.toggle("load-complete");
  checkmark.style.display = display === "none" ? "block" : "none";
}
