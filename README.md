# hypercopy
Quick file/directory copying from Hyperdrives.

This minimal tool makes it easy to do one-off full downloads from Hyperdrives using `npx` without any additional configuration.

## Installation
```
npm i -g hypercopy
```

## Usage
```
> hypercopy [drive-key] [output-directory]
```

This command will use Hyperdrive and Hyperswarm to download the entire Hyperdrive with key `drive-key`, saving the results in your local directory at `output-directory`.

If you cancel your download with Ctrl+c before it's completed, the transient corestore will not be deleted from disk -- this lets you easily resume where you left off.

### Drive Creation

You can also use hypercopy to quickly create and seed temporary drives from folders. This is useful for sharing one-off drives, or for easy testing:

```
> hypercopy create path-to-folder/
```

The command will output a drive key. It will keep running in the foreground until you exit with ctrl+c.

Once you exit, the temporary drive will be deleted.

## License
MIT
