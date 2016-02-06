FROM iron/java:1.8
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY target/app-standalone.jar /usr/src/app/
CMD ["java", "-server", "-jar", "app-standalone.jar"]
