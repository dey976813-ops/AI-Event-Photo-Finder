from io import BytesIO

from PIL import Image, ImageOps


def perceptual_hash(content: bytes) -> str:
    """Return a 64-bit average hash for a valid uploaded image."""
    with Image.open(BytesIO(content)) as image:
        grayscale = ImageOps.grayscale(image).resize((8, 8), Image.Resampling.LANCZOS)
        pixels = list(grayscale.getdata())
    average = sum(pixels) / len(pixels)
    bits = "".join("1" if pixel >= average else "0" for pixel in pixels)
    return f"{int(bits, 2):016x}"


def hamming_distance(left: str, right: str) -> int:
    return (int(left, 16) ^ int(right, 16)).bit_count()