# hypercopy
Quick file/directory copying from Hyperdrives.

This minimal tool makes it easy to do one-off full downloads from Hyperdrives using `npx` without any additional configuration.

### Usage
```
> npx hypercopy [drive-key] [output-directory]
```

This command will use Hyperdrive and Hyperswarm to download the entire Hyperdrive with key `drive-key`, saving the results in your local directory at `output-directory`.

If you cancel your download with Ctrl+c before it's completed, the transient corestore will not be deleted from disk -- this lets you easily resume where you left off.

### License
MIT
