#!/usr/bin/env bash

# Processes fonts in `fonts` directory to create woff2 files in latin and latin-ext subsets
# requires `pip install fonttools` and `pip install brotli`
## TODO: make this CI component that downloads latest release of Iosevka

pyftsubset fonts/iosevka-sparkle-bold.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-bold.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/iosevka-sparkle-bold.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-bold.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
pyftsubset fonts/iosevka-sparkle-bolditalic.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-bolditalic.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/iosevka-sparkle-bolditalic.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-bolditalic.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
pyftsubset fonts/iosevka-sparkle-italic.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-italic.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/iosevka-sparkle-italic.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-italic.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
pyftsubset fonts/iosevka-sparkle-regular.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-regular.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/iosevka-sparkle-regular.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-sparkle-regular.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F

pyftsubset fonts/Iosevka-Bold.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-bold.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/Iosevka-Bold.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-bold.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
pyftsubset fonts/Iosevka-Italic.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-italic.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/Iosevka-Italic.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-italic.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
pyftsubset fonts/Iosevka-Regular.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-regular.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/Iosevka-Regular.ttf --output-file=../website/assets/fonts/iosevka/woff2/iosevka-regular.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F