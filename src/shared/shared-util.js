export const CONTROL_BYTE = 0xFF;

export const validateName = (name) =>
    /^[A-Za-z0-9-_!@#$%^&*()`~{}[\]\|;':",.<>\/?]{1,16}$/.test(name);