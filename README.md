# Batch Vocal Remover
This is a small command line utility that uses [Ultimate Vocal Remover](https://github.com/Anjok07/ultimatevocalremovergui/tree/v5-beta-cml) to remove vocals from tracks.

The tool was designed for my specific work flow. It will accept an input of either a single file or a directory. If a directory is received, it will process every file in that directory. 

## Requirements
* Ultimate Vocal Remover GUI v5.x
* DBPowerAmp
* Python 3.7
* Node v16

## Simultaneous Conversions
You can execute multiple conversions simultaneously using the `-n` argument. For example, `yarn start:dev -i ~/Downloads/some_album_dir -n 4`, will process 4 tracks at a time. 

## Notes
### Ultimate Vocal Remover Version
This tool depends on the `MGM-v5-KAROKEE-32000-BETA1` model which is only found in V5 of the ultimate vocal remover. 

This is currently the `v5-beta-cml` branch of the Ultimate Vocal Remover GUI Repo. 

### Audio Format Conversion
This tool uses DBPowerAmp for converting between audio formats -- the final output will be a V0 MP3.