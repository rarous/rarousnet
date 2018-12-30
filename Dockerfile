FROM openjdk:12-alpine
WORKDIR /usr/src/app
RUN mkdir -p /usr/src/app
COPY target/app-standalone.jar /usr/src/app/
CMD ["java", "-server", "-jar", "app-standalone.jar"]
