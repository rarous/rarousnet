#!/usr/bin/env bash

# Processes fonts in `fonts` directory to create woff2 files in latin and latin-ext subsets
# requires `pip install fonttools` and `pip install brotli`
## TODO: make this CI component that downloads latest release of Iosevka


pyftsubset fonts/agrandir-variable.ttf --output-file=../www.rarous.net/src/fonts/agrandir/variable.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/agrandir-variable.ttf --output-file=../www.rarous.net/src/fonts/agrandir/variable.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0100-0101,U+0104-0130,U+0132-0151,U+0154-017F,U+018F,U+0192,U+01A0-01A1,U+01AF-01B0,U+01FA-01FF,U+0218-021B,U+0237,U+0259,U+1E80-1E85,U+1E9E,U+20A1,U+20A4,U+20A6,U+20A8-20AA,U+20AD-20AE,U+20B1-20B2,U+20B4-20B5,U+20B8-20BA,U+20BD,U+20BF

pyftsubset fonts/Iosevka-Bold.ttf --output-file=../www.rarous.net/src/fonts/iosevka/woff2/iosevka-bold.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/Iosevka-Bold.ttf --output-file=../www.rarous.net/src/fonts/iosevka/woff2/iosevka-bold.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
pyftsubset fonts/Iosevka-Italic.ttf --output-file=../www.rarous.net/src/fonts/iosevka/woff2/iosevka-italic.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/Iosevka-Italic.ttf --output-file=../www.rarous.net/src/fonts/iosevka/woff2/iosevka-italic.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
pyftsubset fonts/Iosevka-Regular.ttf --output-file=../www.rarous.net/src/fonts/iosevka/woff2/iosevka-regular.latin.woff2 --flavor=woff2 --layout-features='*' --unicodes=U+0-FF,U+131,U+152,U+153,U+2BB,U+2BC,U+2C6,U+2DA,U+2DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD
pyftsubset fonts/Iosevka-Regular.ttf --output-file=../www.rarous.net/src/fonts/iosevka/woff2/iosevka-regular.latin-ext.woff2 --flavor=woff2 --layout-features='*' --unicodes=100-17F
