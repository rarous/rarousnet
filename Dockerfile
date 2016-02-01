FROM java:9-jre
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY app-standalone.jar /usr/src/app/
CMD ["java", "-server", "-jar", "app-standalone.jar"]
