/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs'
import cli from 'cli'
import { getStorageProvider, createDefaultStorageProvider } from '@xrengine/server-core/src/media/storageprovider/storageprovider'

const UNIQUIFIED_FILE_NAME_REGEX = /\.[a-zA-Z0-9]{8}$/

cli.enable('status');

cli.main(async () => {
    try {
        await createDefaultStorageProvider()
        const storageProvider = getStorageProvider()
        let files = await storageProvider.listFolderContent('client', true)
        files = files.filter(file => UNIQUIFIED_FILE_NAME_REGEX.test(file.name))
        await fs.writeFileSync('S3FilesToRemove.json', JSON.stringify(files.map(file => file.key)))
        console.log('Created list of S3 files to delete after deployment')
        process.exit(0)
    } catch(err) {
        console.log('Error in getting deletable S3 client files:');
        console.log(err);
        cli.fatal(err)
    }
});
