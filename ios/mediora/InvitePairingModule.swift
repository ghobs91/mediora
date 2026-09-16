import Foundation
import Network
import React

#if canImport(UIKit)
import UIKit
#endif

/**
 * LAN invite pairing.
 *
 * Lets an invite be moved from a phone/Mac onto an Apple TV without typing the
 * long invite code on the TV remote:
 *
 *   - The Apple TV *hosts*: it listens on a TCP socket, advertises the
 *     `_mediora-pair._tcp` Bonjour service and shows a short 6-digit code.
 *   - The phone/Mac *sends*: it browses for hosts, then POSTs
 *     `{ code, invite }` to the chosen host. The code proves the sender can
 *     see the TV.
 *
 * The invite code is asset-encrypted by the caller (see `utils/inviteCode`),
 * so even a successful pairing yields nothing without the passphrase. The
 * short code is TTL-limited and rate-limited to make LAN brute-forcing
 * unattractive.
 *
 * All work runs on a private serial queue; only the promise callbacks cross
 * over to JS.
 */
@objc(InvitePairingModule)
class InvitePairingModule: NSObject {

  private let serviceType = "_mediora-pair._tcp"
  private let queue = DispatchQueue(label: "com.mediora.invitepairing")

  private let codeTTL: TimeInterval = 180
  private let maxAttempts = 10

  // Host state
  private var listener: NWListener?
  private var pairingCode: String?
  private var codeIssuedAt: Date?
  private var failedAttempts = 0
  private var activeConnection: NWConnection?
  private var pendingInviteResolver: RCTPromiseResolveBlock?
  private var pendingInviteRejecter: RCTPromiseRejectBlock?
  /// Holds an invite that arrived before `waitForInvite` was called.
  private var bufferedInvite: String?

  // Sender state
  private var browser: NWBrowser?
  private var discoveredEndpoints: [String: NWEndpoint] = [:]
  private var discoveredNames: [String: String] = [:]
  private var discoveredOrder: [String] = []
  private var browseResolve: RCTPromiseResolveBlock?
  private var browseReject: RCTPromiseRejectBlock?

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  // MARK: - Host

  @objc func startHosting(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      self.stopHostingInternal()

      do {
        let parameters = NWParameters.tcp
        let listener = try NWListener(using: parameters, on: .any)

        let code = self.generateCode()
        self.pairingCode = code
        self.codeIssuedAt = Date()
        self.failedAttempts = 0

        let name = self.deviceName()
        listener.service = NWListener.Service(name: name, type: self.serviceType)

        var resolved = false
        listener.stateUpdateHandler = { state in
          switch state {
          case .ready:
            guard !resolved else { return }
            resolved = true
            resolve(["code": code, "name": name])
          case .failed(let error):
            reject("HOST_FAILED", error.localizedDescription, error)
          default:
            break
          }
        }
        listener.newConnectionHandler = { [weak self] connection in
          self?.handleIncoming(connection)
        }

        self.listener = listener
        listener.start(queue: self.queue)
      } catch {
        reject("HOST_FAILED", error.localizedDescription, error)
      }
    }
  }

  @objc func waitForInvite(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard self.listener != nil, self.pairingCode != nil else {
        reject("NOT_HOSTING", "Start hosting before waiting for an invite.", nil)
        return
      }
      // An invite may have arrived between startHosting and now: deliver it.
      if let buffered = self.bufferedInvite {
        self.bufferedInvite = nil
        resolve(["invite": buffered])
        return
      }
      // Only one waiter at a time; a newer wait supersedes the old one.
      self.pendingInviteRejecter?("SUPERSEDED", "A newer wait replaced this one.", nil)
      self.pendingInviteResolver = resolve
      self.pendingInviteRejecter = reject
    }
  }

  @objc func stopHosting(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      self.stopHostingInternal()
      resolve(nil)
    }
  }

  private func stopHostingInternal() {
    listener?.cancel()
    listener = nil
    activeConnection?.cancel()
    activeConnection = nil
    pairingCode = nil
    codeIssuedAt = nil
    failedAttempts = 0
    bufferedInvite = nil
    pendingInviteRejecter?("CANCELLED", "Pairing stopped.", nil)
    pendingInviteResolver = nil
    pendingInviteRejecter = nil
  }

  private func handleIncoming(_ connection: NWConnection) {
    activeConnection?.cancel()
    activeConnection = connection

    connection.stateUpdateHandler = { state in
      if case .failed = state { connection.cancel() }
    }
    connection.start(queue: queue)

    var buffer = Data()

    func receiveMore() {
      connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
        [weak self] data, _, isComplete, error in
        guard let self = self else { return }

        if let data = data, !data.isEmpty {
          buffer.append(data)
          if let request = self.parseRequest(buffer) {
            self.processRequest(request, on: connection)
            return
          }
        }
        if let error = error {
          _ = error
          connection.cancel()
          return
        }
        if isComplete {
          connection.cancel()
          return
        }
        receiveMore()
      }
    }

    receiveMore()
  }

  private struct HTTPRequest {
    let method: String
    let path: String
    let body: Data
  }

  private func parseRequest(_ data: Data) -> HTTPRequest? {
    guard let headerRange = data.range(of: Data("\r\n\r\n".utf8)) else {
      return nil
    }
    let headerData = data.subdata(in: 0..<headerRange.lowerBound)
    guard let headerString = String(data: headerData, encoding: .utf8) else {
      return nil
    }
    let lines = headerString.components(separatedBy: "\r\n")
    guard let requestLine = lines.first else { return nil }
    let parts = requestLine.split(separator: " ")
    guard parts.count >= 2 else { return nil }

    var contentLength = 0
    for line in lines.dropFirst() {
      let pair = line.split(separator: ":", maxSplits: 1)
      guard pair.count == 2 else { continue }
      if pair[0].trimmingCharacters(in: .whitespaces).lowercased() == "content-length" {
        contentLength = Int(pair[1].trimmingCharacters(in: .whitespaces)) ?? 0
      }
    }

    let bodyStart = headerRange.upperBound
    let available = data.count - bodyStart
    guard available >= contentLength else { return nil }
    let body = data.subdata(in: bodyStart..<(bodyStart + contentLength))
    return HTTPRequest(
      method: String(parts[0]),
      path: String(parts[1]),
      body: body
    )
  }

  private func processRequest(_ request: HTTPRequest, on connection: NWConnection) {
    guard request.method == "POST", request.path.hasPrefix("/pair") else {
      respond(connection, status: "405 Method Not Allowed", body: ["ok": false])
      return
    }

    guard let code = pairingCode,
          let issuedAt = codeIssuedAt,
          Date().timeIntervalSince(issuedAt) <= codeTTL else {
      respond(connection, status: "403 Forbidden", body: [
        "ok": false, "error": "expired",
      ])
      return
    }

    guard
      let json = try? JSONSerialization.jsonObject(with: request.body) as? [String: Any],
      let receivedCode = json["code"] as? String,
      let invite = json["invite"] as? String,
      !invite.isEmpty
    else {
      respond(connection, status: "400 Bad Request", body: [
        "ok": false, "error": "bad_request",
      ])
      return
    }

    guard constantTimeEquals(receivedCode, code) else {
      failedAttempts += 1
      if failedAttempts >= maxAttempts {
        respond(connection, status: "429 Too Many Requests", body: [
          "ok": false, "error": "too_many_attempts",
        ])
        stopHostingInternal()
      } else {
        respond(connection, status: "403 Forbidden", body: [
          "ok": false, "error": "bad_code",
        ])
      }
      return
    }

    let resolver = pendingInviteResolver
    pendingInviteResolver = nil
    pendingInviteRejecter = nil
    respond(connection, status: "200 OK", body: ["ok": true])
    if let resolver = resolver {
      resolver(["invite": invite])
    } else {
      // No waiter yet (e.g. a very fast sender) — hold it for the next wait.
      bufferedInvite = invite
    }
  }

  private func respond(_ connection: NWConnection, status: String, body: [String: Any]) {
    let payload = (try? JSONSerialization.data(withJSONObject: body)) ?? Data()
    var header = "HTTP/1.1 \(status)\r\n"
    header += "Content-Type: application/json\r\n"
    header += "Content-Length: \(payload.count)\r\n"
    header += "Connection: close\r\n\r\n"
    var response = Data(header.utf8)
    response.append(payload)
    connection.send(content: response, completion: .contentProcessed { _ in
      connection.cancel()
    })
  }

  // MARK: - Sender

  @objc func browse(
    _ timeoutMs: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      self.stopBrowsingInternal()
      self.discoveredEndpoints.removeAll()
      self.discoveredNames.removeAll()
      self.discoveredOrder.removeAll()
      self.browseResolve = resolve
      self.browseReject = reject

      let parameters = NWParameters.tcp
      let browser = NWBrowser(
        for: .bonjour(type: self.serviceType, domain: nil),
        using: parameters
      )

      browser.stateUpdateHandler = { [weak self] state in
        if case .failed(let error) = state {
          self?.finishBrowse(error: error)
        }
      }
      browser.browseResultsChangedHandler = { [weak self] results, _ in
        guard let self = self else { return }
        for result in results {
          let id = String(describing: result.endpoint)
          if self.discoveredEndpoints[id] == nil {
            self.discoveredEndpoints[id] = result.endpoint
            self.discoveredNames[id] = self.displayName(for: result.endpoint)
            self.discoveredOrder.append(id)
          }
        }
      }

      self.browser = browser
      browser.start(queue: self.queue)

      let timeout = DispatchTime.now() + .milliseconds(max(500, timeoutMs.intValue))
      self.queue.asyncAfter(deadline: timeout) {
        self.finishBrowse(error: nil)
      }
    }
  }

  private func finishBrowse(error: Error?) {
    guard let resolve = browseResolve else { return }
    let reject = browseReject
    browseResolve = nil
    browseReject = nil
    browser?.cancel()
    browser = nil

    if let error = error {
      reject?("BROWSE_FAILED", error.localizedDescription, error)
      return
    }

    let hosts: [[String: Any]] = discoveredOrder.map { id in
      ["id": id, "name": discoveredNames[id] ?? "Apple TV"]
    }
    resolve(["hosts": hosts])
  }

  private func stopBrowsingInternal() {
    browser?.cancel()
    browser = nil
  }

  @objc func send(
    _ hostId: String,
    code: String,
    invite: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard let endpoint = self.discoveredEndpoints[hostId] else {
        reject(
          "UNKNOWN_HOST",
          "That Apple TV is no longer available. Search again and pick it.",
          nil
        )
        return
      }

      let parameters = NWParameters.tcp
      let connection = NWConnection(to: endpoint, using: parameters)

      var finished = false
      let finish: (Error?) -> Void = { error in
        if finished { return }
        finished = true
        connection.cancel()
        if let error = error {
          reject("SEND_FAILED", error.localizedDescription, error)
        } else {
          resolve(["ok": true])
        }
      }

      let body: [String: Any] = ["code": code, "invite": invite]
      let payload = (try? JSONSerialization.data(withJSONObject: body)) ?? Data()
      var header = "POST /pair HTTP/1.1\r\n"
      header += "Host: mediora.local\r\n"
      header += "Content-Type: application/json\r\n"
      header += "Content-Length: \(payload.count)\r\n"
      header += "Connection: close\r\n\r\n"
      var request = Data(header.utf8)
      request.append(payload)

      var buffer = Data()

      func receiveResponse() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
          data, _, isComplete, error in
          if let data = data, !data.isEmpty {
            buffer.append(data)
            if let text = String(data: buffer, encoding: .utf8) {
              if text.contains("HTTP/1.1 200") {
                finish(nil)
                return
              }
              if text.contains("HTTP/1.1 4") || text.contains("HTTP/1.1 5") {
                finish(NSError(
                  domain: "com.mediora.invitepairing",
                  code: 2,
                  userInfo: [NSLocalizedDescriptionKey:
                    "The Apple TV rejected the pairing. Check the code shown on the TV and try again."]
                ))
                return
              }
            }
          }
          if let error = error {
            finish(error)
            return
          }
          if isComplete {
            finish(nil)
            return
          }
          receiveResponse()
        }
      }

      connection.stateUpdateHandler = { state in
        switch state {
        case .ready:
          connection.send(content: request, completion: .contentProcessed { error in
            if let error = error {
              finish(error)
            } else {
              receiveResponse()
            }
          })
        case .failed(let error):
          finish(error)
        default:
          break
        }
      }

      let timeout = DispatchTime.now() + .seconds(15)
      self.queue.asyncAfter(deadline: timeout) {
        finish(NSError(
          domain: "com.mediora.invitepairing",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "The Apple TV did not respond."]
        ))
      }

      connection.start(queue: self.queue)
    }
  }

  // MARK: - Helpers

  private func generateCode() -> String {
    var code = ""
    for _ in 0..<6 {
      code += String(Int.random(in: 0...9))
    }
    return code
  }

  private func constantTimeEquals(_ a: String, _ b: String) -> Bool {
    let aBytes = Array(a.utf8)
    let bBytes = Array(b.utf8)
    if aBytes.count != bBytes.count { return false }
    var difference: UInt8 = 0
    for index in 0..<aBytes.count {
      difference |= aBytes[index] ^ bBytes[index]
    }
    return difference == 0
  }

  private func deviceName() -> String {
    #if os(tvOS)
    return "Apple TV"
    #elseif os(macOS)
    return ProcessInfo.processInfo.hostName
    #else
    return UIDevice.current.name
    #endif
  }

  private func displayName(for endpoint: NWEndpoint) -> String {
    if case let .service(name, _, _, _) = endpoint {
      return name
    }
    return String(describing: endpoint)
  }
}
