/** The frame host's root-owned dotenv file with the server's credentials and settings. */
export const HOST_ENV_FILE = '/opt/garage-frame/frame.env'

/** Where the container sees `HOST_ENV_FILE`; the server reads it through `FRAME_ENV_FILE`. */
export const CONTAINER_ENV_FILE = '/run/garage-frame/frame.env'
