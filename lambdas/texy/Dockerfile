FROM php:alpine
RUN apk -v --update add python py-pip groff less mailcap \
 && pip install --upgrade awscli python-magic \
 && apk -v --purge del py-pip \
 && rm /var/cache/apk/*
COPY . /usr/src/app
WORKDIR /usr/src/app
CMD aws s3 cp s3://${S3_BUCKET}/${INPUT_FILE} ./${INPUT_FILE} \
 && cat ./${INPUT_FILE} | php index.php > ./${OUTPUT_FILE} \
 && aws s3 cp ./${OUTPUT_FILE} s3://${S3_BUCKET}/${OUTPUT_FILE}
