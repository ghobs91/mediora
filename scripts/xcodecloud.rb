#!/usr/bin/env ruby
# Xcode Cloud helper — drives the App Store Connect API (Xcode Cloud endpoints)
# with a JWT signed by an App Store Connect API key (.p8).
#
# Usage:
#   ASC_ISSUER_ID=... ASC_KEY_ID=... ASC_KEY_PATH=... ruby scripts/xcodecloud.rb products
#   ... ruby scripts/xcodecloud.rb workflows <product-id>
#   ... ruby scripts/xcodecloud.rb refs <repository-id>
#   ... ruby scripts/xcodecloud.rb start <workflow-id> <git-ref-id>
#   ... ruby scripts/xcodecloud.rb status <buildrun-id>
#   ... ruby scripts/xcodecloud.rb actions <buildrun-id>
#   ... ruby scripts/xcodecloud.rb issues <buildaction-id>
#   ... ruby scripts/xcodecloud.rb artifacts <buildaction-id>

require 'openssl'
require 'base64'
require 'json'
require 'net/http'
require 'uri'

HOST = 'api.appstoreconnect.apple.com'

def b64url(data)
  Base64.urlsafe_encode64(data, padding: false)
end

def build_jwt(issuer, key_id, key_pem)
  header = { alg: 'ES256', kid: key_id, typ: 'JWT' }
  now = Time.now.to_i
  payload = { iss: issuer, iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }
  signing_input = b64url(header.to_json) + '.' + b64url(payload.to_json)

  key = OpenSSL::PKey::EC.new(key_pem)
  digest = OpenSSL::Digest::SHA256.digest(signing_input)
  der = key.dsa_sign_asn1(digest)
  asn1 = OpenSSL::ASN1.decode(der)
  r = asn1.value[0].value.to_s(2).rjust(32, "\0")
  s = asn1.value[1].value.to_s(2).rjust(32, "\0")

  signing_input + '.' + b64url(r + s)
end

def api_request(jwt, method, path, body = nil)
  uri = URI("https://#{HOST}#{path}")
  req = case method
        when 'GET' then Net::HTTP::Get.new(uri)
        when 'POST' then Net::HTTP::Post.new(uri)
        else raise "unsupported method #{method}"
        end
  req['Authorization'] = "Bearer #{jwt}"
  if body
    req['Content-Type'] = 'application/json'
    req.body = body.to_json
  end
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
  raise "HTTP #{res.code}: #{res.body[0, 500]}" unless res.code.to_i < 300

  JSON.parse(res.body)
end

def die(msg)
  warn msg
  exit 1
end

def pretty(obj)
  JSON.pretty_generate(obj)
end

def main
cmd = ARGV.shift
die 'missing command' unless cmd

issuer = ENV['ASC_ISSUER_ID']
key_id = ENV['ASC_KEY_ID']
key_path = ENV['ASC_KEY_PATH']
die 'set ASC_ISSUER_ID, ASC_KEY_ID, ASC_KEY_PATH' if [issuer, key_id, key_path].any?(&:nil?)

jwt = build_jwt(issuer, key_id, File.read(key_path))

case cmd
when 'products'
  data = api_request(jwt, 'GET', '/v1/ciProducts')
  data['data'].each do |p|
    attrs = p['attributes']
    puts "product id=#{p['id']} name=#{attrs['name']} type=#{attrs['productType']}"
  end

when 'workflows'
  product_id = ARGV.shift or die 'usage: workflows <product-id>'
  data = api_request(jwt, 'GET', "/v1/ciProducts/#{product_id}/workflows?include=repository")
  data['data'].each do |w|
    attrs = w['attributes']
    repo_id = w['relationships']['repository']['data']['id']
    puts "workflow id=#{w['id']} name=#{attrs['name']} branch=#{attrs.dig('branchStartPoint', 'refName') || '(tag/other)'} repoId=#{repo_id} actions=#{attrs['actions'].map { |a| a['name'] }.join(', ')}"
  end

when 'refs'
  repo_id = ARGV.shift or die 'usage: refs <repository-id>'
  data = api_request(jwt, 'GET', "/v1/scmRepositories/#{repo_id}/gitReferences")
  data['data'].each do |r|
    attrs = r['attributes']
    next unless attrs['kind'] == 'BRANCH'
    puts "ref id=#{r['id']} name=#{attrs['name']} canBuild=#{attrs['canBeBuilt']}"
  end

when 'start'
  workflow_id = ARGV.shift or die 'usage: start <workflow-id> <git-ref-id>'
  ref_id = ARGV.shift or die 'usage: start <workflow-id> <git-ref-id>'
  body = {
    data: {
      type: 'ciBuildRuns',
      attributes: {},
      relationships: {
        workflow: { data: { type: 'ciWorkflows', id: workflow_id } },
        sourceBranchOrTag: { data: { type: 'scmGitReferences', id: ref_id } }
      }
    }
  }
  data = api_request(jwt, 'POST', '/v1/ciBuildRuns', body)
  puts pretty(data)

when 'status'
  buildrun_id = ARGV.shift or die 'usage: status <buildrun-id>'
  data = api_request(jwt, 'GET', "/v1/ciBuildRuns/#{buildrun_id}?include=builds")
  br = data['data']
  attrs = br['attributes']
  puts "executionProgress=#{attrs['executionProgress']} completionStatus=#{attrs['completionStatus']} started=#{attrs['startDate']} finished=#{attrs['finishedDate']}"
  (data['included'] || []).each do |b|
    next unless b['type'] == 'ciBuilds'
    puts "build id=#{b['id']} number=#{b['attributes']['number']} status=#{b['attributes']['executionProgress']} completion=#{b['attributes']['completionStatus']}"
  end

when 'runs'
  workflow_id = ARGV.shift or die 'usage: runs <workflow-id>'
  data = api_request(jwt, 'GET', "/v1/ciBuildRuns?filter%5Bworkflow%5D=#{workflow_id}&include=builds&limit=10")
  data['data'].each do |br|
    attrs = br['attributes']
    number = attrs['number']
    puts "buildRun id=#{br['id']} number=#{number} progress=#{attrs['executionProgress']} completion=#{attrs['completionStatus']} started=#{attrs['startDate']} finished=#{attrs['finishedDate']}"
  end

when 'actions'
  buildrun_id = ARGV.shift or die 'usage: actions <buildrun-id>'
  data = api_request(jwt, 'GET', "/v1/ciBuildRuns/#{buildrun_id}/actions")
  data['data'].each do |a|
    attrs = a['attributes']
    puts "action id=#{a['id']} name=#{attrs['name']} type=#{attrs['actionType']} progress=#{attrs['executionProgress']} completion=#{attrs['completionStatus']} issues=#{attrs['issueCounts'].inspect}"
  end

when 'issues'
  action_id = ARGV.shift or die 'usage: issues <buildaction-id>'
  data = api_request(jwt, 'GET', "/v1/ciBuildActions/#{action_id}/issues")
  data['data'].each do |i|
    attrs = i['attributes']
    puts "--- #{attrs['category']} severity=#{attrs['issueType']}: #{attrs['message']}"
    puts attrs['fileSource'] if attrs['fileSource']
  end

when 'artifacts'
  action_id = ARGV.shift or die 'usage: artifacts <buildaction-id>'
  data = api_request(jwt, 'GET', "/v1/ciBuildActions/#{action_id}/artifacts")
  data['data'].each do |a|
    attrs = a['attributes']
    puts "artifact id=#{a['id']} type=#{attrs['fileType']} name=#{attrs['fileName']} size=#{attrs['fileSize']} url=#{attrs['downloadUrl']}"
  end

else
  die "unknown command #{cmd}"
end
end

if $PROGRAM_NAME == __FILE__
  main
end
