const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

export function generateCode(): string {
    const rand = new Uint32Array(CODE_LENGTH)
    crypto.getRandomValues(rand)
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) {
        code += ALPHABET[rand[i] % ALPHABET.length]
    }
    return code
}
