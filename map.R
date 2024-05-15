plotGoogleMap <- function () {
  tryCatch(
    expr = {
      suppressPackageStartupMessages(library(RgoogleMaps))
      suppressPackageStartupMessages(library(rjson))
      # print(commandArgs(trailingOnly=TRUE))
      # exifData <- as.data.frame(fromJSON(file = "C:\\Users\\Fared.Farag\\Desktop\\Flight_Checker\\Flight_Checker\\src\\temp_files\\FLIGHT_CHECKER_COORDINATES.json"))
      exifData <- as.data.frame(fromJSON(file = commandArgs(trailingOnly=TRUE)[1]))
      lat <- exifData$GPSLatitude
      long <- exifData$GPSLongitude
      center <- c(mean(lat), mean(long))
      zoom <- min(MaxZoom(range(lat), range(long)));
      
      satelliteMap = GetMap(center = center, 
                            zoom = zoom,
                            maptype = "satellite",
                            type = "google-s")
      
      # determine file names
      filename1 <- "FLIGHT_CHECKER_IMAGES_PLOT_POINTS.png"
      filename2 <- "FLIGHT_CHECKER_IMAGES_PLOT_LINES.png"
      dirname <- getCurrentFileLocation()
      counter1 <- 1
      counter2 <- 1
      
      # filename 1
      while (TRUE) {
        if (file.exists(file.path(dirname, "temp_files", filename1))) {
          filename1 <- paste0("FLIGHT_CHECKER_IMAGES_PLOT_POINTS_", toString(counter1), ".png")
          counter1 <- counter1 + 1
        }
        else {
          break
        }
      }
      
      # filename 2
      while (TRUE) {
        if (file.exists(file.path(dirname, "temp_files", filename2))) {
          filename2 <- paste0("FLIGHT_CHECKER_IMAGES_PLOT_LINES_", toString(counter2), ".png")
          counter2 <- counter2 + 1
        }
        else {
          break
        }
      }
      
      png(file.path(dirname, "temp_files", filename1), type = "cairo-png", res = 200, width = 1800, height = 1800)
      PlotOnStaticMap(satelliteMap, 
                      lat = lat, 
                      lon = long, 
                      lwd = 1,
                      col = "black", 
                      cex = 1.5,
                      pch = 21, 
                      bg = "red", 
                      FUN = points)
      dev.off()
      
      png(file.path(dirname, "temp_files", filename2), type = "cairo-png", res = 200, width = 1800, height = 1800)
      PlotOnStaticMap(satelliteMap, 
                      lat = lat, 
                      lon = long, 
                      lwd = 2, 
                      col = "red", 
                      cex = 1.5,
                      pch = 21, 
                      bg = "red", 
                      FUN = lines)
      dev.off()
      
      # print(paste0("success*", filename1, "*", filename2))
      return(paste0("!@#!success*", filename1, "*", filename2))
    },
    error = function (e){
      print(e)
      
      return("fail")
    }
  )
}

getCurrentFileLocation <-  function() {
  suppressPackageStartupMessages(library(tidyverse))
  this_file <- commandArgs() %>%
    tibble::enframe(name = NULL) %>%
    tidyr::separate(col=value, into=c("key", "value"), sep="=", fill='right') %>%
    dplyr::filter(key == "--file") %>%
    dplyr::pull(value)
  if (length(this_file)==0) {
    this_file <- rstudioapi::getSourceEditorContext()$path
  }
  
  return(dirname(this_file))
}

# getCurrentFileLocation1 <-  function() {
#   df <- tibble::enframe(commandArgs(), name = NULL)
#   df.sep <- tidyr::separate(df, col=value, into=c("key", "value"), sep="=", fill='right')
#   df.filter <- dplyr::filter(df.sep, key == "--file")
#   this.file <- dplyr::pull(df.filter, value)
#   
#   if (length(this.file)==0) {
#     print("yes1")
#     this.file <- rstudioapi::getSourceEditorContext()$path
#   }
#   return(dirname(this.file))
# }
# 
setLibraryPath <- function() {
  dirname <- dirname(strsplit(commandArgs()[4], "=")[[1]][2])
  .libPaths(file.path(dirname, "..", "..", "R", "R-4.2.1", "library"))
}

installPackages <- function() {
  # install packages if not found
  list.of.packages <- c("dplyr", "tibble", "tidyr", "RgoogleMaps", "tidyverse", "rjson")
  new.packages <- list.of.packages[!(list.of.packages %in% installed.packages()[,"Package"])]
  if(length(new.packages)) {
    suppressMessages(install.packages(new.packages,
                                      repos = "https://cran.rstudio.com/",
                                      dependencies = TRUE,
                                      type = "binary",
                                      verbose = FALSE,
                                      clean = TRUE))
  }
} 

setLibraryPath()
installPackages()
plotGoogleMap()