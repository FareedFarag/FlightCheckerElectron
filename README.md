# Flight Checker

This repository contains the source code for the Flight Checker desktop app, written with Electron.js framework.

## Installation

Coming soon

## Features

The software validates multispectral drone imagery following the image acquisition process. The software checks for:

#### Missing Images

The software checks every capture in the dataset and ensures that it contains all the spectral bands (which is 6 bands for the Altum sensor). All capture IDs that contain missing images are reported back to the user.

#### Presence of Calibration Targets

The software ensures that there's atleast one full capture of calibration targets present in the dataset.

#### Presense of Sun Irradiance data

The software ensures that each image in the dataset contains sun irradiance data, which is collected by a downwelling light sensor (DLS). All image and set IDs that contain missing sun irradiance data are reported back to the user

#### Ensuring Stitchable Projects

The software aids decision-making by determining the need to re-fly the area of interest (AOI) based on the proportion of missing captures relative to the total number of captures. Captures containing images that are missing, corrupted, or with missing metadata tags are discarded and considered as a "missing capture" for this calculation. If the proportion of missing captures exceeds 4%, the software recommends re-flying the AOI. This threshold choice was inspired by the Pix4DMapper stitching software, which does not allow projects to be stitched if the proportion of the missing captures surpasses 5%. Thus, the software used a slightly stricter threshold of 4% to avoid potential edge cases.

#### Visualizing AOI Coverage

To ensure comprehensive coverage of the AOI and uniform image capture rates, the software generates two portable network graphics (PNG) maps: one plotting the coordinates of each capture as red dots to provide a visual confirmation of AOI coverage and consistent capture gaps, and another depicting the flight path of the drone as lines to ensure adherence to expected flight patterns. Both maps are overlaid with satellite basemaps to provide more accurate representations of the coordinates and flight paths.

## Sensor Compatibility

For now, the software was written to only work for the Altum multispectral sensor coupled with the DLS IMU. Future versions of the software might include support for more sensors.

## Dataset Directory Structure

The Altum sensor creates the following directory structure, where the software expects the image dataset to be formatted in:

<pre>
│ <- choose the root directory when browsing the folder in the software
├── 0000SET\
│   │
│   ├── 000\
│   │   │
│   │   ├── IMG_0000_1.tif
│   │   ├── IMG_0000_2.tif
│   │   ├── IMG_0000_3.tif
│   │   ├── IMG_0000_4.tif
│   │   ├── IMG_0000_5.tif
│   │   ├── IMG_0000_6.tif
│   │   ├── IMG_0001_1.tif
│   │   ├── ...
│   │   │
│   ├── 001\
│   │   │
│   │   ├── IMG_0200_1.tif
│   │   ├── ...
│   │   │
├── 0001SET\
│   │
│   ├── ...
│   │
│   │
</pre>
